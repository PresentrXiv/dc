'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import * as ZoomPanPinch from 'react-zoom-pan-pinch';
import { List } from 'react-window';
import CommentComposerModal from './CommentComposerModal';
import CommentsPanel, { type Comment } from './CommentsPanel';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// ---- ZoomPanPinch (typed loosely to avoid TS/version mismatches) ----
const TransformWrapper = ZoomPanPinch.TransformWrapper as unknown as React.ComponentType<any>;
const TransformComponent = ZoomPanPinch.TransformComponent as unknown as React.ComponentType<any>;

type Poster = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;
  filepath?: string;
};

// Measure any element (used for left navigator sizing)
function useMeasure<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });

  // callback ref: guarantees we re-run effect when the DOM node appears/changes
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



  // Center viewer measurement (robust, grows with layout)
  const centerMeasure = useMeasure<HTMLDivElement>();


  const centerPageWidth = useMemo(() => {
    const w = centerMeasure.rect.width || 0;
    // subtract: outer border (2) + inner p-3 (24) + safety (16) = 42ish
    return Math.max(320, Math.floor(w - 48));
  }, [centerMeasure.rect.width]);




  // Mobile measurement (independent of desktop center column)
  const mobileMeasure = useMeasure<HTMLDivElement>();

  const mobilePageWidth = useMemo(() => {
    const w = mobileMeasure.rect.width || 0;
    // padding + border safety
    return Math.max(320, Math.floor(w - 16));
  }, [mobileMeasure.rect.width]);
//swipe handlers
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);

  function onSwipeStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return; // ignore pinch
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }
  
  function onSwipeEnd(e: React.TouchEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
  
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
  
    if (dt > 800) return; // too slow
    if (Math.abs(dx) < 60) return; // not far enough
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return; // mostly vertical
  
    if (dx < 0) {
      // swipe left => next
      setPageNumber((p) => Math.min(numPages || p, p + 1));
    } else {
      // swipe right => prev
      setPageNumber((p) => Math.max(1, p - 1));
    }
  }


  // Configure pdf.js worker
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  // Track orientation + breakpoint
  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      setIsLandscape(window.matchMedia('(orientation: landscape)').matches);
      setIsLargeScreen(window.matchMedia('(min-width: 1024px)').matches);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Measure center viewer width (desktop) and cap ~900


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




  // Zoomable page (used for SMALL SCREENS only, and only on the current slide to keep it light)
  const ZoomablePage = ({
    page,
    width,
    onZoomedChange,
  }: {
    page: number;
    width: number;
    onZoomedChange?: (zoomed: boolean) => void;
  }) => {
    return (
      <TransformWrapper
        minScale={1}
        maxScale={3}
        initialScale={1}
        wheel={{ disabled: true }}
        doubleClick={{ mode: 'reset' }}
        pinch={{ step: 5 }}
        panning={{ disabled: false, velocityDisabled: true }}
        onZoomStop={(ref: any) => onZoomedChange?.(ref?.state?.scale > 1.02)}
        onPanningStop={(ref: any) => onZoomedChange?.(ref?.state?.scale > 1.02)}
        onPinchingStop={(ref: any) => onZoomedChange?.(ref?.state?.scale > 1.02)}
      >
        {() => (
          <TransformComponent wrapperStyle={{ width: '100%' }} contentStyle={{ width: '100%' }}>

          </TransformComponent>
        )}
      </TransformWrapper>
    );
  };

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
                <Page
                  pageNumber={page}
                  width={thumbWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
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
              rowProps={{
                currentPage,
                onJump,
                thumbWidth,
              }}
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
        {composerOpen && (
          <div className="fixed bottom-4 left-4 z-[200] rounded bg-black text-white px-3 py-2 text-sm">
            composerOpen = true
          </div>
        )}

        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white border-b">
          <div className="mx-auto max-w-6xl px-3 py-2 flex items-center justify-between gap-3">
            <Link href="/" className="text-blue-600 text-sm">
              ← Back
            </Link>

            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-semibold text-gray-900">
                {poster.title || 'Untitled'}
              </div>

              <div className="truncate text-xs text-gray-700">{poster.author ? `by ${poster.author}` : ''}</div>
            </div>

            <button
  onClick={handleDelete}
  className="hidden lg:inline-block bg-red-600 text-white px-3 py-2 rounded text-sm"
>
  Delete
</button>
          </div>
        </div>
        {/* MOBILE */}
        <div className="block lg:hidden px-3 py-4 space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between w-full">
            <div className="text-sm font-medium text-gray-900">
              Slide {pageNumber} / {numPages || '?'}
            </div>

            <button
              onClick={() => {
               
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

          {/* Viewer (swipe here) */}
          <div
            ref={mobileMeasure.ref}
            className="w-full bg-white rounded-lg border p-2"
            onTouchStart={onSwipeStart}
            onTouchEnd={onSwipeEnd}
          >
            <div style={{ touchAction: 'pan-y pinch-zoom' }}>
              <Page
                pageNumber={pageNumber}
                width={mobilePageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </div>
          </div>

          <div className="text-center text-xs text-gray-700">
            Swipe to change slides
          </div>
        </div>

{/* Modal composer (sibling of DESKTOP + MOBILE, inside min-h-screen) */}
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
          xl:gap-4 xl:px-4" >


        {/* Left nav (virtualized) */}
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


        {/* DESKTOP Center viewer */}
        {/* IMPORTANT: do NOT overflow-hidden this container, it causes both-side clipping */}

        <div ref={centerMeasure.ref} className="min-w-0 h-[calc(100vh-76px)] rounded-lg border bg-white">
          <div
            className="h-full overflow-x-auto overflow-y-auto"
            style={{ touchAction: 'pan-y pinch-zoom' }}
          >
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

            {/* This is the *single* measured box. */}
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
        




      </div>
    </div>
    </Document >

  );
}
