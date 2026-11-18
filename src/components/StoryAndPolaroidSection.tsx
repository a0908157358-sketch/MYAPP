import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  BookHeart,
  Camera,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ImagePlus,
  MapPin,
  Plus,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { PartnerProfile, PolaroidPhoto, TimelineNode } from '../types/couple';
import { compressImageFile } from '../utils/imageCompression';

const MOODS = ['心動瞬間', '暖心陪伴', '成長蛻變', '重逢悸動', '日常甜笑', '旅行記憶'];
const MAX_POLAROID_PHOTOS = 6;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getPolaroidPhotos(pol: PolaroidPhoto): string[] {
  if (Array.isArray(pol.photoDataUrls) && pol.photoDataUrls.length > 0) {
    return pol.photoDataUrls;
  }
  return pol.photoDataUrl ? [pol.photoDataUrl] : [];
}

export const StoryAndPolaroidSection: React.FC<{
  myProfile: PartnerProfile;
  timelineNodes: TimelineNode[];
  polaroids: PolaroidPhoto[];
  allowedEmails: string[];
}> = ({ myProfile, timelineNodes, polaroids, allowedEmails }) => {
  const [viewMode, setViewMode] = useState<'timeline' | 'polaroid'>('timeline');

  // Timeline state
  const [showAddStory, setShowAddStory] = useState(false);
  const [expandedNode, setExpandedNode] = useState<TimelineNode | null>(null);
  const [storyDate, setStoryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBody, setStoryBody] = useState('');
  const [storyMood, setStoryMood] = useState(MOODS[0]);
  const [storyPhoto, setStoryPhoto] = useState('');
  const [savingStory, setSavingStory] = useState(false);

  // Polaroid wall state
  const [showAddPolaroid, setShowAddPolaroid] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});
  const [slideIndices, setSlideIndices] = useState<Record<string, number>>({});

  // Create Polaroid state (supports multi-photo up to 6)
  const [polPhotos, setPolPhotos] = useState<string[]>([]);
  const [polDate, setPolDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [polFront, setPolFront] = useState('');
  const [polBack, setPolBack] = useState('');
  const [polLoc, setPolLoc] = useState('');
  const [savingPol, setSavingPol] = useState(false);

  // Edit Polaroid Modal state
  const [editingPol, setEditingPol] = useState<PolaroidPhoto | null>(null);
  const [editPolPhotos, setEditPolPhotos] = useState<string[]>([]);
  const [editPolDate, setEditPolDate] = useState('');
  const [editPolFront, setEditPolFront] = useState('');
  const [editPolLoc, setEditPolLoc] = useState('');
  const [editPolBack, setEditPolBack] = useState('');
  const [savingEditPol, setSavingEditPol] = useState(false);

  const [uploadError, setUploadError] = useState('');

  // Touch swipe tracking so horizontal swipe on photos doesn't trigger card 3D flip
  const touchStartRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const suppressNextFlipRef = useRef(false);

  const sortedTimeline = useMemo(
    () => [...timelineNodes].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [timelineNodes]
  );

  const handleStoryPhotoUpload = async (file: File) => {
    setUploadError('');
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 880,
        maxDataUrlLength: 360_000,
      });
      setStoryPhoto(compressed);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '圖片壓縮失敗');
    }
  };

  const compressBatchForPolaroid = async (
    files: File[],
    existingPhotos: string[]
  ): Promise<string[]> => {
    const remainingSlots = Math.max(0, MAX_POLAROID_PHOTOS - existingPhotos.length);
    const chosen = files.slice(0, remainingSlots);
    if (chosen.length === 0) {
      throw new Error(`每張拍立得最多可上傳 ${MAX_POLAROID_PHOTOS} 張照片`);
    }

    const totalCount = existingPhotos.length + chosen.length;
    const existingBytes = existingPhotos.reduce((acc, s) => acc + s.length, 0);
    // Keep entire Firestore document safely below 1MB (~640KB for images combined)
    const remainingBudget = Math.max(90_000 * chosen.length, 640_000 - existingBytes);
    const perPhotoMaxLen = Math.min(
      340_000,
      Math.max(85_000, Math.floor(remainingBudget / chosen.length))
    );
    const maxDim = totalCount > 2 ? 720 : 880;

    const results: string[] = [];
    for (const file of chosen) {
      const compressed = await compressImageFile(file, {
        maxDim,
        maxDataUrlLength: perPhotoMaxLen,
      });
      results.push(compressed);
    }
    return results;
  };

  const handlePolaroidFilesSelect = async (
    fileList: FileList | null,
    mode: 'create' | 'edit'
  ) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError('');
    const files = Array.from(fileList);
    try {
      if (mode === 'create') {
        const added = await compressBatchForPolaroid(files, polPhotos);
        setPolPhotos((prev) => [...prev, ...added].slice(0, MAX_POLAROID_PHOTOS));
      } else {
        const added = await compressBatchForPolaroid(files, editPolPhotos);
        setEditPolPhotos((prev) => [...prev, ...added].slice(0, MAX_POLAROID_PHOTOS));
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '圖片壓縮失敗');
    }
  };

  const handleCreateStory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storyTitle.trim() || !storyBody.trim()) return;
    setSavingStory(true);
    const id = generateId('story');
    try {
      await setDoc(doc(db, 'timeline', id), {
        id,
        eventDate: storyDate,
        title: storyTitle.trim().slice(0, 80),
        story: storyBody.trim().slice(0, 1200),
        mood: storyMood,
        photoDataUrl: storyPhoto,
        creatorUid: myProfile.uid,
        creatorName: myProfile.nickname,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setStoryTitle('');
      setStoryBody('');
      setStoryPhoto('');
      setShowAddStory(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `timeline/${id}`);
    } finally {
      setSavingStory(false);
    }
  };

  const handleCreatePolaroid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (polPhotos.length === 0 || !polFront.trim()) return;
    setSavingPol(true);
    setUploadError('');
    const id = generateId('pol');
    const tiltDeg = Number(((Math.random() - 0.5) * 6).toFixed(1));
    try {
      await setDoc(doc(db, 'polaroids', id), {
        id,
        photoDataUrl: polPhotos[0],
        photoDataUrls: polPhotos,
        captionDate: polDate,
        frontCaption: polFront.trim().slice(0, 60),
        backNote: polBack.trim().slice(0, 400),
        location: polLoc.trim().slice(0, 60),
        tiltDeg,
        creatorUid: myProfile.uid,
        creatorName: myProfile.nickname,
        allowedEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setPolPhotos([]);
      setPolFront('');
      setPolBack('');
      setPolLoc('');
      setShowAddPolaroid(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `polaroids/${id}`);
    } finally {
      setSavingPol(false);
    }
  };

  const openEditPolaroidModal = (pol: PolaroidPhoto) => {
    setUploadError('');
    setEditingPol(pol);
    setEditPolPhotos(getPolaroidPhotos(pol));
    setEditPolDate(pol.captionDate || new Date().toISOString().slice(0, 10));
    setEditPolFront(pol.frontCaption || '');
    setEditPolLoc(pol.location || '');
    setEditPolBack(pol.backNote || '');
  };

  const handleSaveEditPolaroid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPol || editPolPhotos.length === 0 || !editPolFront.trim()) return;
    setSavingEditPol(true);
    setUploadError('');
    try {
      await updateDoc(doc(db, 'polaroids', editingPol.id), {
        photoDataUrl: editPolPhotos[0],
        photoDataUrls: editPolPhotos,
        captionDate: editPolDate.trim().slice(0, 30) || editingPol.captionDate,
        frontCaption: editPolFront.trim().slice(0, 60),
        location: editPolLoc.trim().slice(0, 60),
        backNote: editPolBack.trim().slice(0, 400),
        updatedAt: serverTimestamp(),
      });
      setSlideIndices((prev) => ({
        ...prev,
        [editingPol.id]: Math.min(prev[editingPol.id] || 0, editPolPhotos.length - 1),
      }));
      setEditingPol(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `polaroids/${editingPol.id}`);
    } finally {
      setSavingEditPol(false);
    }
  };

  const stepCardPhoto = (polId: string, total: number, delta: number) => {
    if (total <= 1) return;
    setSlideIndices((prev) => {
      const current = prev[polId] || 0;
      const next = (current + delta + total) % total;
      return { ...prev, [polId]: next };
    });
  };

  return (
    <div className="space-y-6">
      {/* 頂部分頁切換與新增按鈕 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-card w-full sm:w-fit">
          <button
            type="button"
            onClick={() => setViewMode('timeline')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
              viewMode === 'timeline'
                ? 'bg-white dark:bg-slate-800 shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <BookHeart className="h-4 w-4" />
            故事時間軸 ({sortedTimeline.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('polaroid')}
            className={`flex-1 sm:flex-initial min-h-[42px] px-4 py-2 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
              viewMode === 'polaroid'
                ? 'bg-white dark:bg-slate-800 shadow-sm'
                : 'text-[var(--text-secondary)]'
            }`}
          >
            <Camera className="h-4 w-4" />
            拍立得相簿牆 ({polaroids.length})
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setUploadError('');
            if (viewMode === 'timeline') setShowAddStory(true);
            else setShowAddPolaroid(true);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-2xl text-sm font-semibold text-white shadow-sm inline-flex items-center justify-center gap-2 transition active:scale-[0.98] whitespace-nowrap shrink-0"
          style={{ backgroundColor: 'var(--accent-500)' }}
        >
          <Plus className="h-4 w-4" />
          {viewMode === 'timeline' ? '新增故事節點' : '新增拍立得照片'}
        </button>
      </div>

      {/* 1. 雙人故事時間軸 */}
      {viewMode === 'timeline' && (
        <section>
          {sortedTimeline.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <BookHeart className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-sm font-semibold">屬於我們的故事軸正等待第一筆落墨</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                從第一次相遇、初戀、各自成長到重新牽手，紀錄每個重要里程碑
              </p>
            </div>
          ) : (
            <div className="relative pl-6 md:pl-0">
              {/* 發光垂直時間軸 */}
              <div
                className="absolute top-2 bottom-2 left-2.5 md:left-1/2 md:-translate-x-1/2 w-0.5 rounded-full"
                style={{
                  background:
                    'linear-gradient(180deg, var(--accent-400), var(--accent-600), transparent)',
                  boxShadow: '0 0 12px var(--accent-glow-1)',
                }}
              />

              <div className="space-y-6">
                {sortedTimeline.map((node, index) => {
                  const isRight = index % 2 === 1;
                  return (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative md:flex md:items-center ${
                        isRight ? 'md:justify-end' : 'md:justify-start'
                      }`}
                    >
                      <div
                        className="absolute -left-[19px] md:left-1/2 md:-translate-x-1/2 top-6 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 shadow"
                        style={{ backgroundColor: 'var(--accent-500)' }}
                      />

                      <div className="md:w-[46%]">
                        <button
                          type="button"
                          onClick={() => setExpandedNode(node)}
                          className="w-full text-left glass-card rounded-3xl p-5 hover:scale-[1.01] transition active:scale-[0.99] space-y-2.5"
                        >
                          <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                            {node.eventDate}
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-sans">{node.mood}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-sans">{node.creatorName}</span>
                          </p>
                          <h3 className="text-base sm:text-lg font-bold tracking-tight">
                            {node.title}
                          </h3>
                          {node.photoDataUrl && (
                            <div className="rounded-2xl overflow-hidden aspect-[16/10] bg-black/5">
                              <img
                                src={node.photoDataUrl}
                                alt={node.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <p className="text-sm text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                            {node.story}
                          </p>
                          <span
                            className="inline-block text-xs font-medium"
                            style={{ color: 'var(--accent-500)' }}
                          >
                            點擊展開完整回憶 →
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* 2. 升級版專屬拍立得相簿牆（1:1 比例不裁切 + 多張輪播滑動 + 完整編輯） */}
      {viewMode === 'polaroid' && (
        <section>
          {polaroids.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <Camera className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-sm font-semibold">拍立得牆目前還是空的</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                可一次上傳多張 1:1 完整相片不裁切，點擊相片可 3D 翻面寫下悄悄話，並隨時編輯內容
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-2">
              {polaroids.map((pol) => {
                const photos = getPolaroidPhotos(pol);
                const activeIdx = Math.min(slideIndices[pol.id] || 0, Math.max(0, photos.length - 1));
                const currentPhoto = photos[activeIdx] || pol.photoDataUrl;
                const isFlipped = !!flippedIds[pol.id];

                return (
                  <div
                    key={pol.id}
                    className="perspective-1000 h-[445px] sm:h-[430px] transition-transform duration-300 hover:rotate-0"
                    style={{ transform: `rotate(${pol.tiltDeg}deg)` }}
                  >
                    <div
                      className={`relative w-full h-full preserve-3d transition-transform duration-700 ease-out cursor-pointer ${
                        isFlipped ? 'rotate-y-180' : ''
                      }`}
                      onClick={() => {
                        if (suppressNextFlipRef.current) {
                          suppressNextFlipRef.current = false;
                          return;
                        }
                        setFlippedIds((prev) => ({
                          ...prev,
                          [pol.id]: !prev[pol.id],
                        }));
                      }}
                    >
                      {/* 正面：1:1 正方形完整相片（object-contain 絕不裁切）+ 輪播 + 手寫標題 + 編輯鈕 */}
                      <div className="absolute inset-0 backface-hidden rounded-2xl bg-[#FCFCFA] dark:bg-slate-100 text-slate-900 p-3.5 pb-4 shadow-xl border border-black/10 flex flex-col justify-between">
                        <div
                          className="w-full aspect-square shrink-0 rounded-lg overflow-hidden bg-[#EFEAE2] relative flex items-center justify-center touch-pan-y"
                          onTouchStart={(e) => {
                            if (photos.length <= 1) return;
                            const touch = e.touches[0];
                            touchStartRef.current = {
                              id: pol.id,
                              x: touch.clientX,
                              y: touch.clientY,
                            };
                          }}
                          onTouchEnd={(e) => {
                            const start = touchStartRef.current;
                            touchStartRef.current = null;
                            if (!start || start.id !== pol.id || photos.length <= 1) return;
                            const touch = e.changedTouches[0];
                            const dx = touch.clientX - start.x;
                            const dy = touch.clientY - start.y;
                            if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
                              suppressNextFlipRef.current = true;
                              stepCardPhoto(pol.id, photos.length, dx < 0 ? 1 : -1);
                            }
                          }}
                        >
                          <img
                            src={currentPhoto}
                            alt={`${pol.frontCaption} (${activeIdx + 1}/${photos.length})`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain select-none"
                          />

                          {/* 多張照片張數標記 & 切換按鈕 */}
                          {photos.length > 1 && (
                            <>
                              <span
                                onClick={(e) => e.stopPropagation()}
                                className="absolute top-2 right-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[10px] font-mono-tabular font-semibold text-white"
                              >
                                {activeIdx + 1} / {photos.length}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  stepCardPhoto(pol.id, photos.length, -1);
                                }}
                                aria-label="上一張照片"
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center transition active:scale-95 touch-manipulation"
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  stepCardPhoto(pol.id, photos.length, 1);
                                }}
                                aria-label="下一張照片"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center transition active:scale-95 touch-manipulation"
                              >
                                <ChevronRight className="h-4 w-4" />
                              </button>

                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 backdrop-blur-sm"
                              >
                                {photos.map((_, idx) => (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() =>
                                      setSlideIndices((prev) => ({ ...prev, [pol.id]: idx }))
                                    }
                                    aria-label={`跳至第 ${idx + 1} 張`}
                                    className={`h-1.5 rounded-full transition-all ${
                                      idx === activeIdx ? 'w-3.5 bg-white' : 'w-1.5 bg-white/50'
                                    }`}
                                  />
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="pt-2.5 px-1 flex items-end justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-serif-editorial text-xs text-slate-500">
                              {pol.captionDate}
                              {pol.location ? ` · ${pol.location}` : ''}
                            </p>
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {pol.frontCaption}
                            </p>
                          </div>

                          <div
                            className="flex items-center gap-1.5 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => openEditPolaroidModal(pol)}
                              aria-label="編輯拍立得"
                              className="min-h-[30px] px-2.5 py-1 rounded-lg bg-slate-900/10 hover:bg-slate-900/15 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 transition active:scale-95 touch-manipulation"
                            >
                              <Edit3 className="h-3 w-3" />
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setFlippedIds((prev) => ({ ...prev, [pol.id]: !prev[pol.id] }))
                              }
                              aria-label="翻面查看悄悄話"
                              className="min-h-[30px] px-2 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-900/5 inline-flex items-center gap-1 touch-manipulation"
                            >
                              <RotateCw className="h-3 w-3" />
                              翻面
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 背面：悄悄話與拍攝地點 */}
                      <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl bg-[#F6F3EC] dark:bg-slate-800 text-[var(--text-primary)] p-5 shadow-xl border border-[var(--border-glass)] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] min-w-0">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{pol.location || '未填寫地點'}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditPolaroidModal(pol)}
                              aria-label="編輯拍立得貼文"
                              className="min-h-[34px] px-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/10 text-xs font-medium inline-flex items-center gap-1 touch-manipulation"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                              編輯
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await deleteDoc(doc(db, 'polaroids', pol.id));
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.DELETE, `polaroids/${pol.id}`);
                                }
                              }}
                              aria-label="刪除拍立得"
                              className="min-h-[34px] min-w-[34px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center touch-manipulation"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 flex items-center justify-center px-2 overflow-y-auto my-2">
                          <p className="text-sm leading-relaxed text-center whitespace-pre-wrap break-words">
                            {pol.backNote || '（點擊「編輯」按鈕，留下給另一半的背面悄悄話）'}
                          </p>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-2 border-t border-[var(--border-glass)]">
                          <span>拍攝者：{pol.creatorName}</span>
                          <span>點擊空白處翻回正面</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 展開故事細節 Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {expandedNode && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setExpandedNode(null)}
                  className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 14 }}
                  className="relative z-10 glass-card-strong w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4 pointer-events-auto"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-muted)] font-mono-tabular">
                        {expandedNode.eventDate} · {expandedNode.mood} · {expandedNode.creatorName}
                      </p>
                      <h3 className="mt-1 text-xl font-bold">{expandedNode.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedNode(null)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center text-[var(--text-muted)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {expandedNode.photoDataUrl && (
                    <div className="rounded-2xl overflow-hidden bg-black/10">
                      <img
                        src={expandedNode.photoDataUrl}
                        alt={expandedNode.title}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-[340px] object-contain mx-auto"
                      />
                    </div>
                  )}

                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                    {expandedNode.story}
                  </p>

                  <div className="pt-3 border-t border-[var(--border-glass)] flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        const targetId = expandedNode.id;
                        setExpandedNode(null);
                        try {
                          await deleteDoc(doc(db, 'timeline', targetId));
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `timeline/${targetId}`);
                        }
                      }}
                      className="min-h-[40px] px-4 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
                    >
                      <Trash2 className="h-4 w-4" />
                      刪除此回憶節點
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 新增故事節點 Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showAddStory && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setShowAddStory(false)}
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  onSubmit={handleCreateStory}
                  className="relative z-10 glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4 pointer-events-auto"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">新增故事時間軸節點</h3>
                    <button
                      type="button"
                      onClick={() => setShowAddStory(false)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        發生日期
                      </label>
                      <input
                        type="date"
                        required
                        value={storyDate}
                        onChange={(e) => setStoryDate(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm font-mono-tabular outline-none pointer-events-auto select-text touch-manipulation"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        心情標籤
                      </label>
                      <select
                        value={storyMood}
                        onChange={(e) => setStoryMood(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm outline-none pointer-events-auto touch-manipulation"
                      >
                        {MOODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      節點標題
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={storyTitle}
                      onChange={(e) => setStoryTitle(e.target.value)}
                      placeholder="例如：我們重新牽起手的夜晚"
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      故事短文
                    </label>
                    <textarea
                      rows={4}
                      required
                      maxLength={1200}
                      value={storyBody}
                      onChange={(e) => setStoryBody(e.target.value)}
                      placeholder="記錄當時的對話、細節與心境..."
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none resize-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      附加一張照片（選填，將自動壓縮）
                    </label>
                    <label className="min-h-[48px] rounded-2xl border border-dashed border-[var(--border-glass)] flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer hover:bg-white/40 dark:hover:bg-slate-800/40 transition p-3">
                      <ImagePlus className="h-4 w-4" />
                      <span>{storyPhoto ? '已選擇照片（點擊更換）' : '從相簿選取照片'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) handleStoryPhotoUpload(f);
                        }}
                        className="hidden"
                      />
                    </label>
                    {storyPhoto && (
                      <img
                        src={storyPhoto}
                        alt="預覽"
                        className="mt-2 h-28 w-full object-contain bg-black/5 rounded-2xl"
                      />
                    )}
                  </div>

                  {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}

                  <button
                    type="submit"
                    disabled={savingStory}
                    className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98]"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    {savingStory ? '儲存中...' : '保存故事節點'}
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 新增拍立得 Modal（支援多張上傳 ＋ 1:1 完整不裁切預覽） */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showAddPolaroid && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setShowAddPolaroid(false)}
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  onSubmit={handleCreatePolaroid}
                  className="relative z-10 glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4 pointer-events-auto"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">上傳專屬拍立得</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        支援一次選取多張（最多 {MAX_POLAROID_PHOTOS} 張），1:1 完整顯示不裁切
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddPolaroid(false)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* 1:1 多張預覽網格與加入按鈕 */}
                  {polPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2.5">
                      {polPhotos.map((src, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl overflow-hidden bg-[#EFEAE2] border border-[var(--border-glass)] flex items-center justify-center"
                        >
                          <img
                            src={src}
                            alt={`拍立得預覽 ${idx + 1}`}
                            className="w-full h-full object-contain"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPolPhotos((prev) => prev.filter((_, i) => i !== idx))
                            }
                            aria-label={`移除第 ${idx + 1} 張`}
                            className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-rose-500 transition"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {polPhotos.length < MAX_POLAROID_PHOTOS && (
                    <label className="min-h-[92px] rounded-2xl border border-dashed border-[var(--border-glass)] flex flex-col items-center justify-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer hover:bg-white/40 dark:hover:bg-slate-800/40 transition p-4">
                      <ImagePlus className="h-6 w-6" />
                      <span>
                        {polPhotos.length > 0
                          ? `再加入照片（已選 ${polPhotos.length}/${MAX_POLAROID_PHOTOS} 張）`
                          : `點擊選擇相片（可複選最多 ${MAX_POLAROID_PHOTOS} 張）`}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          handlePolaroidFilesSelect(e.target.files, 'create');
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        拍攝日期
                      </label>
                      <input
                        type="date"
                        required
                        value={polDate}
                        onChange={(e) => setPolDate(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm font-mono-tabular outline-none pointer-events-auto select-text touch-manipulation"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        拍攝地點
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={polLoc}
                        onChange={(e) => setPolLoc(e.target.value)}
                        placeholder="例如：陽明山夜景"
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      正面手寫標題
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={polFront}
                      onChange={(e) => setPolFront(e.target.value)}
                      placeholder="寫在拍立得下方的短句"
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      背面悄悄話（翻面後可見）
                    </label>
                    <textarea
                      rows={3}
                      maxLength={400}
                      value={polBack}
                      onChange={(e) => setPolBack(e.target.value)}
                      placeholder="寫給對方的秘密留言..."
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none resize-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}

                  <button
                    type="submit"
                    disabled={savingPol || polPhotos.length === 0}
                    className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-500)' }}
                  >
                    {savingPol ? '沖印同步中...' : '貼上拍立得相簿牆'}
                  </button>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* 編輯拍立得貼文 Modal（標題、日期、地點、悄悄話、增刪多張照片） */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {editingPol && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-auto">
                <div
                  onClick={() => setEditingPol(null)}
                  className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                  aria-hidden="true"
                />
                <motion.form
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16 }}
                  onSubmit={handleSaveEditPolaroid}
                  className="relative z-10 glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4 pointer-events-auto"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold">編輯拍立得內容</h3>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        可調整標題、日期、地點、悄悄話或增減照片（1:1 完整顯示）
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingPol(null)}
                      className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {/* 編輯照片清單 */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2.5">
                      {editPolPhotos.map((src, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-xl overflow-hidden bg-[#EFEAE2] border border-[var(--border-glass)] flex items-center justify-center"
                        >
                          <img
                            src={src}
                            alt={`相片 ${idx + 1}`}
                            className="w-full h-full object-contain"
                          />
                          {editPolPhotos.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditPolPhotos((prev) => prev.filter((_, i) => i !== idx))
                              }
                              aria-label={`刪除第 ${idx + 1} 張相片`}
                              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-rose-500 transition"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}

                      {editPolPhotos.length < MAX_POLAROID_PHOTOS && (
                        <label className="aspect-square rounded-xl border border-dashed border-[var(--border-glass)] flex flex-col items-center justify-center gap-1 text-[11px] text-[var(--text-secondary)] cursor-pointer hover:bg-white/40 dark:hover:bg-slate-800/40 transition p-2 text-center">
                          <Plus className="h-4 w-4" />
                          <span>新增照片</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => {
                              handlePolaroidFilesSelect(e.target.files, 'edit');
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        拍攝日期
                      </label>
                      <input
                        type="date"
                        required
                        value={editPolDate}
                        onChange={(e) => setEditPolDate(e.target.value)}
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm font-mono-tabular outline-none pointer-events-auto select-text touch-manipulation"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                        拍攝地點
                      </label>
                      <input
                        type="text"
                        maxLength={60}
                        value={editPolLoc}
                        onChange={(e) => setEditPolLoc(e.target.value)}
                        placeholder="例如：淡水漁人碼頭"
                        className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      正面手寫標題
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={60}
                      value={editPolFront}
                      onChange={(e) => setEditPolFront(e.target.value)}
                      placeholder="寫在拍立得下方的短句"
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                      背面悄悄話（翻面後可見）
                    </label>
                    <textarea
                      rows={3}
                      maxLength={400}
                      value={editPolBack}
                      onChange={(e) => setEditPolBack(e.target.value)}
                      placeholder="寫下想留在相片背面的悄悄話..."
                      className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-base sm:text-sm outline-none resize-none pointer-events-auto select-text touch-manipulation"
                    />
                  </div>

                  {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingPol(null)}
                      className="flex-1 min-h-[46px] rounded-2xl glass-card text-xs font-semibold"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={savingEditPol || editPolPhotos.length === 0 || !editPolFront.trim()}
                      className="flex-1 min-h-[46px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-500)' }}
                    >
                      {savingEditPol ? '儲存變更中...' : '儲存修改'}
                    </button>
                  </div>
                </motion.form>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};
