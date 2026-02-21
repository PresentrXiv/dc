'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import { List } from 'react-window';
import CommentComposerModal from './CommentComposerModal';
import CommentsPanel, { type Comment } from './CommentsPanel';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

type Poster = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;
  filepath?: string;
};

// Measure any element (used for left navigator sizing + center column sizing)
function useMeasure<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });

  const ref = React.useCallback((el: T | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) return;

    const update = () => {
      const cr = node.getBoundingClientRect();
      setRect({ width: cr.width, height: cr.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  return { ref, rect };
}

// Robust width measurement for mobile container (handles iOS rotation better)
function useResponsiveWidth<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [width, setWidth] = useState(0);

  const ref = React.useCallback((el: T | null) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) return;

    const update = () => {
      setWidth(Math.floor(node.clientWidth));
    };

    update();

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? node.clientWidth ?? 0;
      setWidth(Math.floor(w));
    });
    ro.observe(node);

    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      ro.disconnect();
      vv?.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [node]);

  return { ref, width };
}

export default function PosterViewer({ posterId }: { posterId: string }) {
  const router = useRouter();

  // Poster metadata
  const [poster, setPoster] = useState<Poster | null>(null);
  const [error, setError] = useState('');

  // PDF state
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  // Comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [commentTargetPage, setCommentTargetPage] = useState<number>(1);

  // Comment input
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'add' | 'edit'>('add');
  const [composerPage, setComposerPage] = useState<number>(1);
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [composerInitialText, setComposerInitialText] = useState<string>('');

  // Responsive
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Measurements
  const centerMeasure = useMeasure<HTMLDivElement>();
  const mobileMeasure = useResponsiveWidth<HTMLDivElement>();

  // Mobile zoom controls (quick solution)
  const [mobileScale, setMobileScale] = useState(1);
  const zoomRef = useRef<any>(null);
  const [mobileZoomed, setMobileZoomed] = useState(false);
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  function onSwipeStart(e: React.TouchEvent) {
    if (mobileZoomed) return; // <-- zoomed: panning only, no slide nav
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onSwipeEnd(e: React.TouchEvent) {
    if (mobileZoomed) return; // <-- zoomed: panning only, no slide nav
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;

    if (dt > 800) return;
    if (Math.abs(dx) < 60) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

    if (dx < 0) {
      const next = Math.min(numPages || pageNumber, pageNumber + 1);
      setPageNumber(next);
      setCommentTargetPage(next);
    } else {
      const prev = Math.max(1, pageNumber - 1);
      setPageNumber(prev);
      setCommentTargetPage(prev);
    }
  }

  // pdf.js worker
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  // Track orientation + breakpoint
  useEffect(() => {
    const update = () => {
      setIsLandscape(window.matchMedia('(orientation: landscape)').matches);
      setIsLargeScreen(window.matchMedia('(min-width: 1024px)').matches);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Load poster + comments
  useEffect(() => {
    fetchPoster();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  async function fetchPoster() {
    try {
      setPoster(null);
      setError('');

      const res = await fetch(`/api/posters/${posterId}`);
      if (!res.ok) {
        setError(`Failed to load poster (${res.status})`);
        return;
      }
      const data = await res.json();
      setPoster(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function fetchComments() {
    try {
      setLoadingComments(true);
      const res = await fetch(`/api/comments?posterId=${posterId}`);
      if (!res.ok) return;
      const data = await res.json();
      setComments(
        (data || []).map((c: any) => ({
          ...c,
          timestamp: new Date(c.timestamp),
        }))
      );
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this presentation?')) return;

    const res = await fetch(`/api/posters/${posterId}`, { method: 'DELETE' });
    const j = await res.json().catch(() => ({}));

    if (!res.ok) {
      alert(j?.error ?? 'Delete failed');
      return;
    }

    router.push('/');
    router.refresh();
  }

  const pdfUrl = useMemo(() => poster?.fileUrl || poster?.filepath || '', [poster]);

  const pageComments = useMemo(
    () => comments.filter((c) => c.page === commentTargetPage),
    [comments, commentTargetPage]
  );

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber((prev) => (prev < 1 ? 1 : prev > numPages ? numPages : prev));
    setCommentTargetPage((prev) => (prev < 1 ? 1 : prev > numPages ? numPages : prev));
  }

  async function addComment(targetPage: number, text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        posterId,
        page: targetPage,
        text: trimmed,
        author: 'Anonymous',
      }),
    });

    if (!res.ok) {
      alert('Failed to save comment');
      return;
    }

    const saved = await res.json();
    setComments((prev) => [...prev, { ...saved, timestamp: new Date(saved.timestamp) }]);
  }

  // Desktop center width
  const centerPageWidth = useMemo(() => {
    const w = centerMeasure.rect.width || 0;
    return Math.max(320, Math.floor(w - 48));
  }, [centerMeasure.rect.width]);

  // Mobile width (don’t clamp to 320; can cause overflow on small widths)
  const mobilePageWidth = useMemo(() => {
    const w = mobileMeasure.width || 0;
    return Math.max(0, Math.floor(w - 16)); // viewer has p-2
  }, [mobileMeasure.width]);

  // Final mobile rendered width with user scaling
  const mobileRenderWidth = useMemo(() => {
    return Math.max(0, Math.floor(mobilePageWidth * mobileScale));
  }, [mobilePageWidth, mobileScale]);

  // ---- Virtualized mini navigator (react-window v2) ----
  type NavRowExtraProps = {
    currentPage: number;
    onJump: (p: number) => void;
    thumbWidth: number;
  };

  const MiniPdfNavigator = ({
    numPages,
    currentPage,
    onJump,
  }: {
    numPages: number;
    currentPage: number;
    onJump: (page: number) => void;
  }) => {
    const { ref, rect } = useMeasure<HTMLDivElement>();

    const thumbWidth = Math.max(140, Math.floor(rect.width) - 16);
    const thumbHeight = Math.round(thumbWidth * 0.72);
    const rowHeight = thumbHeight + 44;

    const NavRow = ({
      index,
      style,
      currentPage,
      onJump,
      thumbWidth,
    }: {
      index: number;
      style: React.CSSProperties;
    } & NavRowExtraProps) => {
      const page = index + 1;
      const isActive = page === currentPage;

      return (
        <div style={style} className="px-2 py-2">
          <button
            onClick={() => onJump(page)}
            className={[
              'w-full rounded-lg border bg-white hover:bg-gray-50 overflow-hidden',
              isActive ? 'border-blue-600 ring-1 ring-blue-200' : 'border-gray-200',
            ].join(' ')}
          >
            <div className="p-2">
              <div className="flex justify-center items-center" style={{ height: thumbHeight }}>
                <Page pageNumber={page} width={thumbWidth} renderTextLayer={false} renderAnnotationLayer={false} />
              </div>

              <div className="mt-2 text-xs text-gray-600 text-center">Slide {page}</div>
            </div>
          </button>
        </div>
      );
    };

    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="p-3 border-b bg-white">
          <div className="text-sm font-semibold text-gray-700">Slides</div>
          <div className="text-xs text-gray-700">Click a slide to jump</div>
        </div>

        <div ref={ref} className="flex-1">
          {rect.height > 0 && rect.width > 0 && numPages > 0 ? (
            <List<NavRowExtraProps>
              rowComponent={NavRow}
              rowCount={numPages}
              rowHeight={rowHeight}
              rowProps={{ currentPage, onJump, thumbWidth }}
              overscanCount={3}
              defaultHeight={400}
              style={{ height: rect.height, width: rect.width }}
            />
          ) : (
            <div className="p-4 text-sm text-gray-700">Loading…</div>
          )}
        </div>
      </div>
    );
  };

  // ---------------- Render ----------------
  if (!poster) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Link href="/" className="text-blue-600">
          ← Back
        </Link>
        <div className="mt-6 bg-white p-6 rounded shadow">
          <p>Loading presentation…</p>
          {error && <p className="text-red-600 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
      <div className="min-h-screen bg-gray-50">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white border-b">
          <div className="mx-auto max-w-6xl px-3 py-2 flex items-center justify-between gap-3">

            {/* Left: Back + Title */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Link href="/" className="text-blue-600 text-sm whitespace-nowrap">
                ← Back
              </Link>

              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-gray-900">
                  {poster.title || 'Untitled'}
                </div>
                <div className="truncate text-xs text-gray-700">
                  {poster.author ? `by ${poster.author}` : ''}
                </div>
              </div>
            </div>

            {/* Right: Logo */}
            <Link href="/" className="shrink-0">
              <img
                src="/presentrxiv-logo.png"
                alt="PresentrXiv"
                className="h-10 w-auto"
              />
            </Link>

          </div>
        </div>

        {/* MOBILE */}
        <div className="block lg:hidden px-3 py-4 space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between w-full">
            <div className="text-sm font-medium text-gray-900">
              Slide {pageNumber} / {numPages || '?'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  zoomRef.current?.resetTransform?.();
                  setMobileZoomed(false);
                }}
                className="px-2 py-1.5 rounded border bg-white text-sm text-gray-700"
                title="Fit"
              >
                Fit
              </button>

              <button
                onClick={() => {
                  // ensure UI isn't zoomed; zoom applies only to slide anyway, but reset is nice
                  zoomRef.current?.resetTransform?.();
                  setMobileZoomed(false);

                  setComposerMode('add');
                  setComposerPage(pageNumber);
                  setCommentTargetPage(pageNumber);
                  setComposerInitialText('');
                  setEditCommentId(null);
                  setComposerOpen(true);
                }}
                className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium"
              >
                Comment
              </button>
            </div>
          </div>

          {/* Viewer */}
          <div
            ref={mobileMeasure.ref}
            className={`w-full bg-white rounded-lg border p-2 max-w-full ${isLandscape ? 'h-[calc(100dvh-140px)] overflow-hidden' : ''
              }`}
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            <TransformWrapper
              ref={zoomRef}
              minScale={1}
              maxScale={4}
              initialScale={1}
              wheel={{ disabled: true }}
              doubleClick={{ mode: 'reset' }}
              // - not zoomed => disable panning so swipe handlers can run
              // - zoomed => enable panning so swipe drags the image
              panning={{ disabled: !mobileZoomed, velocityDisabled: true }}

              onZoomStop={(ref: any) => setMobileZoomed((ref?.state?.scale ?? 1) > 1.02)}
              onPanningStop={(ref: any) => setMobileZoomed((ref?.state?.scale ?? 1) > 1.02)}
              onPinchingStop={(ref: any) => setMobileZoomed((ref?.state?.scale ?? 1) > 1.02)}
            >
              <TransformComponent wrapperStyle={{ width: '100%' }} contentStyle={{ width: '100%' }}>
                {/* Critical: stop browser-level pinch zoom */}
                <div style={{ touchAction: 'none' }} className="w-full flex justify-center">
                  <Page
                    key={`${pageNumber}-${mobilePageWidth}`}
                    pageNumber={pageNumber}
                    width={mobilePageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              </TransformComponent>
            </TransformWrapper>
          </div>
          {/* Comments (mobile portrait only) */}
          {!isLandscape && (
            <div className="bg-white rounded-lg border">
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <div className="text-sm font-semibold text-gray-800">
                  Comments <span className="text-gray-500 font-normal">({pageComments.length})</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setComposerMode('add');
                    setComposerPage(pageNumber);
                    setCommentTargetPage(pageNumber);
                    setEditCommentId(null);
                    setComposerInitialText('');
                    setComposerOpen(true);
                  }}
                  className="px-2 py-1.5 rounded bg-blue-600 text-white text-sm"
                >
                  Add
                </button>
              </div>

              <div className="max-h-[35dvh] overflow-y-auto px-3 py-2">
                {loadingComments ? (
                  <div className="text-sm text-gray-600">Loading…</div>
                ) : pageComments.length === 0 ? (
                  <div className="text-sm text-gray-600">No comments yet.</div>
                ) : (
                  <div className="space-y-2">
                    {pageComments.map((c) => (
                      <div key={c._id || c.id} className="rounded border border-gray-200 bg-gray-50 p-2">
                        <div className="text-xs text-gray-500 flex items-center justify-between">
                          <span>{c.author || 'Anonymous'}</span>
                          {/* timestamp might already be a Date per your fetchComments() */}
                          <span>
                            {c.timestamp instanceof Date
                              ? c.timestamp.toLocaleString()
                              : new Date(c.timestamp as any).toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{c.text}</div>

                        <div className="mt-2 flex justify-end">
                          <button
                            type="button"
                            className="text-xs text-red-700"
                            onClick={async () => {
                              const id = c._id || c.id;
                              if (!id) return;
                              if (!confirm('Delete this comment?')) return;
                            
                              try {
                                const res = await fetch(`/api/comments?id=${encodeURIComponent(id)}`, {
                                  method: 'DELETE',
                                });
                            
                                if (!res.ok) {
                                  alert('Failed to delete comment.');
                                  return;
                                }
                            
                                await fetchComments(); // ✅ refresh from Mongo
                              } catch (err) {
                                console.error('Delete failed:', err);
                                alert('Delete failed.');
                              }
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="text-center text-xs text-gray-700">
            {mobileZoomed ? 'Drag to move (pinch to zoom, Fit to reset)' : 'Swipe to change slides'}
          </div>
        </div>

        {/* Modal composer */}
        <CommentComposerModal
          open={composerOpen}
          mode={composerMode}
          page={composerPage}
          numPages={numPages}
          initialText={composerInitialText}
          onClose={() => setComposerOpen(false)}
          onSubmit={async (text) => {
            await addComment(composerPage, text);
            setComposerOpen(false);
          }}
        />

        {/* DESKTOP */}
        <div
          className="
            hidden lg:grid
            lg:grid-cols-[clamp(190px,20vw,260px)_minmax(0,1fr)_clamp(240px,25vw,320px)]
            lg:gap-3
            lg:max-w-none lg:mx-auto lg:px-4 lg:py-4
            xl:grid-cols-[clamp(220px,20vw,280px)_minmax(0,1fr)_clamp(280px,25vw,340px)]
            xl:gap-4 xl:px-4
          "
        >
          {/* Left nav */}
          <div className="h-[calc(100vh-76px)] rounded-lg border overflow-hidden bg-white">
            {numPages > 0 ? (
              <MiniPdfNavigator
                numPages={numPages}
                currentPage={pageNumber}
                onJump={(p) => {
                  setPageNumber(p);
                  setCommentTargetPage(p);
                }}
              />
            ) : (
              <div className="p-4 text-sm text-gray-700">Loading…</div>
            )}
          </div>

          {/* Center viewer */}
          <div ref={centerMeasure.ref} className="min-w-0 h-[calc(100vh-76px)] rounded-lg border bg-white">
            <div className="h-full overflow-x-auto overflow-y-auto" style={{ touchAction: 'pan-y pinch-zoom' }}>
              <div className="p-3 border-b flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Slide <span className="font-semibold text-gray-700">{pageNumber}</span> of{' '}
                  <span className="font-semibold text-gray-700">{numPages || '…'}</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={pageNumber <= 1}
                    onClick={() => {
                      const next = Math.max(1, pageNumber - 1);
                      setPageNumber(next);
                      setCommentTargetPage(next);
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
                  >
                    Prev
                  </button>
                  <button
                    disabled={numPages === 0 || pageNumber >= numPages}
                    onClick={() => {
                      const next = Math.min(numPages, pageNumber + 1);
                      setPageNumber(next);
                      setCommentTargetPage(next);
                    }}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="p-3">
                <div className="mx-auto w-full">
                  <div className="w-full flex justify-center">
                    <Page
                      pageNumber={pageNumber}
                      width={centerPageWidth}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="mx-auto"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right comments */}
          <div className="h-[calc(100vh-76px)] rounded-lg border overflow-hidden bg-white">
            <CommentsPanel
              page={commentTargetPage}
              numPages={numPages}
              loading={loadingComments}
              comments={pageComments}
              onOpenAdd={() => {
                setComposerMode('add');
                setComposerPage(commentTargetPage);
                setEditCommentId(null);
                setComposerInitialText('');
                setComposerOpen(true);
              }}
              onOpenEdit={(c) => {
                setComposerMode('edit');
                setComposerPage(c.page);
                setEditCommentId(c._id || c.id || null);
                setComposerInitialText(c.text || '');
                setComposerOpen(true);
              }}
            />
          </div>
          {/* Bottom Danger Zone */}
          <div className="border-t mt-12 pt-6">
            <div className="max-w-6xl mx-auto px-4 flex justify-end">
              <button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition"
              >
                Delete Presentation
              </button>
            </div>
          </div>
        </div>
      </div>
    </Document>
  );
}