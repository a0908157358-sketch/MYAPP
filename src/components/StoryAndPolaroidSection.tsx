import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  BookHeart,
  Camera,
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

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  // Polaroid state
  const [showAddPolaroid, setShowAddPolaroid] = useState(false);
  const [flippedIds, setFlippedIds] = useState<Record<string, boolean>>({});
  const [editingBackId, setEditingBackId] = useState<string | null>(null);
  const [editBackNote, setEditBackNote] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const [polPhoto, setPolPhoto] = useState('');
  const [polDate, setPolDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [polFront, setPolFront] = useState('');
  const [polBack, setPolBack] = useState('');
  const [polLoc, setPolLoc] = useState('');
  const [savingPol, setSavingPol] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const sortedTimeline = useMemo(
    () => [...timelineNodes].sort((a, b) => a.eventDate.localeCompare(b.eventDate)),
    [timelineNodes]
  );

  const handlePhotoUpload = async (
    file: File,
    target: 'story' | 'polaroid'
  ) => {
    setUploadError('');
    try {
      const compressed = await compressImageFile(file, {
        maxDim: 880,
        maxDataUrlLength: 360_000,
      });
      if (target === 'story') setStoryPhoto(compressed);
      else setPolPhoto(compressed);
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
    if (!polPhoto || !polFront.trim()) return;
    setSavingPol(true);
    const id = generateId('pol');
    const tiltDeg = Number(((Math.random() - 0.5) * 7).toFixed(1));
    try {
      await setDoc(doc(db, 'polaroids', id), {
        id,
        photoDataUrl: polPhoto,
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
      setPolPhoto('');
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

  const handleSaveBackNote = async (pol: PolaroidPhoto) => {
    try {
      await updateDoc(doc(db, 'polaroids', pol.id), {
        backNote: editBackNote.trim().slice(0, 400),
        location: editLocation.trim().slice(0, 60),
        updatedAt: serverTimestamp(),
      });
      setEditingBackId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `polaroids/${pol.id}`);
    }
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
          onClick={() =>
            viewMode === 'timeline' ? setShowAddStory(true) : setShowAddPolaroid(true)
          }
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
                      {/* 節點發光圓點 */}
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

      {/* 2. 專屬拍立得相簿牆（3D 翻轉互動） */}
      {viewMode === 'polaroid' && (
        <section>
          {polaroids.length === 0 ? (
            <div className="glass-card rounded-3xl p-10 text-center">
              <Camera className="h-10 w-10 mx-auto text-[var(--text-muted)] mb-3" />
              <p className="text-sm font-semibold">拍立得牆目前還是空的</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                上傳一張合照，點擊相片可 3D 翻面寫下悄悄話與地點
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-2">
              {polaroids.map((pol) => {
                const isFlipped = !!flippedIds[pol.id];
                const isEditingBack = editingBackId === pol.id;

                return (
                  <div
                    key={pol.id}
                    className="perspective-1000 h-[360px] transition-transform duration-300 hover:rotate-0"
                    style={{ transform: `rotate(${pol.tiltDeg}deg)` }}
                  >
                    <div
                      className={`relative w-full h-full preserve-3d transition-transform duration-700 ease-out cursor-pointer ${
                        isFlipped ? 'rotate-y-180' : ''
                      }`}
                      onClick={() => {
                        if (isEditingBack) return;
                        setFlippedIds((prev) => ({
                          ...prev,
                          [pol.id]: !prev[pol.id],
                        }));
                      }}
                    >
                      {/* 正面：拍立得相紙與手寫感標題 */}
                      <div className="absolute inset-0 backface-hidden rounded-2xl bg-[#FCFCFA] dark:bg-slate-100 text-slate-900 p-3.5 pb-5 shadow-xl border border-black/10 flex flex-col justify-between">
                        <div className="w-full h-[250px] rounded-lg overflow-hidden bg-slate-200 relative">
                          <img
                            src={pol.photoDataUrl}
                            alt={pol.frontCaption}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="pt-3 px-1 flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-serif-editorial text-xs text-slate-500">
                              {pol.captionDate}
                            </p>
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {pol.frontCaption}
                            </p>
                          </div>
                          <span className="text-[11px] text-slate-400 inline-flex items-center gap-1 shrink-0">
                            <RotateCw className="h-3 w-3" />
                            翻面
                          </span>
                        </div>
                      </div>

                      {/* 背面：悄悄話與拍攝地點 */}
                      <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl bg-[#F6F3EC] dark:bg-slate-800 text-[var(--text-primary)] p-5 shadow-xl border border-[var(--border-glass)] flex flex-col justify-between">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{pol.location || '未填寫地點'}</span>
                          </div>
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBackId(pol.id);
                                setEditBackNote(pol.backNote);
                                setEditLocation(pol.location);
                              }}
                              aria-label="編輯背面悄悄話"
                              className="min-h-[36px] min-w-[36px] rounded-xl hover:bg-black/5 dark:hover:bg-white/10 flex items-center justify-center"
                            >
                              <Edit3 className="h-4 w-4" />
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
                              className="min-h-[36px] min-w-[36px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {isEditingBack ? (
                          <div
                            className="flex-1 flex flex-col justify-center gap-2.5 my-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              maxLength={60}
                              value={editLocation}
                              onChange={(e) => setEditLocation(e.target.value)}
                              placeholder="拍攝地點（例如：淡水漁人碼頭）"
                              className="w-full rounded-xl border border-[var(--border-glass)] bg-white/70 dark:bg-slate-900/70 px-3 py-2 text-xs outline-none"
                            />
                            <textarea
                              rows={4}
                              maxLength={400}
                              value={editBackNote}
                              onChange={(e) => setEditBackNote(e.target.value)}
                              placeholder="寫下想留在相片背面的悄悄話..."
                              className="w-full rounded-xl border border-[var(--border-glass)] bg-white/70 dark:bg-slate-900/70 px-3 py-2 text-xs outline-none resize-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingBackId(null)}
                                className="flex-1 min-h-[38px] rounded-xl glass-card text-xs font-medium"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveBackNote(pol)}
                                className="flex-1 min-h-[38px] rounded-xl text-xs font-semibold text-white"
                                style={{ backgroundColor: 'var(--accent-500)' }}
                              >
                                儲存背面文字
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex-1 flex items-center justify-center px-2">
                            <p className="text-sm leading-relaxed text-center whitespace-pre-wrap break-words">
                              {pol.backNote || '（點擊右上角編輯筆，留下給另一半的背面悄悄話）'}
                            </p>
                          </div>
                        )}

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
      <AnimatePresence>
        {expandedNode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 14 }}
              className="glass-card-strong w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4"
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
                <div className="rounded-2xl overflow-hidden">
                  <img
                    src={expandedNode.photoDataUrl}
                    alt={expandedNode.title}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[340px] object-cover"
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
      </AnimatePresence>

      {/* 新增故事節點 Modal */}
      <AnimatePresence>
        {showAddStory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onSubmit={handleCreateStory}
              className="glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4"
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
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-sm font-mono-tabular outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    心情標籤
                  </label>
                  <select
                    value={storyMood}
                    onChange={(e) => setStoryMood(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-sm outline-none"
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
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none"
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
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none resize-none"
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
                      if (f) handlePhotoUpload(f, 'story');
                    }}
                    className="hidden"
                  />
                </label>
                {storyPhoto && (
                  <img
                    src={storyPhoto}
                    alt="預覽"
                    className="mt-2 h-28 w-full object-cover rounded-2xl"
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
      </AnimatePresence>

      {/* 新增拍立得 Modal */}
      <AnimatePresence>
        {showAddPolaroid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              onSubmit={handleCreatePolaroid}
              className="glass-card-strong w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">上傳專屬拍立得</h3>
                <button
                  type="button"
                  onClick={() => setShowAddPolaroid(false)}
                  className="min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <label className="min-h-[120px] rounded-2xl border border-dashed border-[var(--border-glass)] flex flex-col items-center justify-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer hover:bg-white/40 dark:hover:bg-slate-800/40 transition p-4">
                {polPhoto ? (
                  <img
                    src={polPhoto}
                    alt="拍立得預覽"
                    className="h-40 w-full object-cover rounded-xl"
                  />
                ) : (
                  <>
                    <ImagePlus className="h-6 w-6" />
                    <span>點擊選擇相片（自動壓縮並套用拍立得邊框）</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoUpload(f, 'polaroid');
                  }}
                  className="hidden"
                />
              </label>

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
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-sm font-mono-tabular outline-none"
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
                    className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-3 py-2.5 text-sm outline-none"
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
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none"
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
                  className="w-full rounded-2xl border border-[var(--border-glass)] bg-white/60 dark:bg-slate-900/60 px-4 py-3 text-sm outline-none resize-none"
                />
              </div>

              {uploadError && <p className="text-xs text-rose-500">{uploadError}</p>}

              <button
                type="submit"
                disabled={savingPol || !polPhoto}
                className="w-full min-h-[48px] rounded-2xl text-sm font-semibold text-white shadow transition active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent-500)' }}
              >
                {savingPol ? '沖印同步中...' : '貼上拍立得相簿牆'}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
