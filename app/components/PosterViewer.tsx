'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { FixedSizeList as List, ListOnScrollProps } from 'react-window';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

type Poster = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;   // Vercel Blob URL
  filepath?: string;  // legacy local field
};

type Comment = {
  _id?: string;
  id?: string;
  posterId: string;
  page: number;
  text: string;
  author: string;
  timestamp: Date;
};

function getId(c: Comment) {
  return c._id || c.id || `${c.posterId}-${c.page}-${c.timestamp.toISOString()}`;
}
function PdfThumb({
  pdfUrl,
  pageNumber,
  width,
}: {
  pdfUrl: string;
  pageNumber: number;
  width: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!pdfUrl || failed) {
    return (
      <div className="w-[160px] h-[100px] bg-gray-100 rounded flex items-center justify-center text-xs text-gray-600">
        Slide {pageNumber}
      </div>
    );
  }

  return (
    <div className="rounded overflow-hidden bg-white">
      <Document
        file={pdfUrl}
        loading={
          <div className="w-[160px] h-[100px] bg-gray-100 rounded flex items-center justify-center text-xs text-gray-600">
            Loading…
          </div>
        }
        error={
          <div className="w-[160px] h-[100px] bg-gray-100 rounded flex items-center justify-center text-xs text-gray-600">
            Slide {pageNumber}
          </div>
        }
        onLoadError={() => setFailed(true)}
        onSourceError={() => setFailed(true)}
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}

export default function PosterViewer({ posterId }: { posterId: string }) {
  const router = useRouter();

  // Poster metadata
  const [poster, setPoster] = useState<Poster | null>(null);
  const [error, setError] = useState('');

  // PDF state
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  // Which slide the user is commenting on (important for mobile)
  const [commentTargetPage, setCommentTargetPage] = useState<number>(1);

  // Small popup menu on a tapped slide (mobile only)
  const [mobileSlideMenu, setMobileSlideMenu] = useState<{
    open: boolean;
    page: number;
  } | null>(null);


  // Comment modal (posting)
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [newComment, setNewComment] = useState('');

  // Orientation + responsive
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Small-screen overlays
  const [showSlideDrawerMobile, setShowSlideDrawerMobile] = useState(false);
  const [showCommentsDrawerMobile, setShowCommentsDrawerMobile] = useState(false);

  // Zoom state for center viewer (large screen)
  const [isZoomed, setIsZoomed] = useState(false);

  // Refs for small-screen scroll tracking
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Configure pdf.js worker
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  // Track orientation + breakpoint
  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      setIsLandscape(window.matchMedia('(orientation: landscape)').matches);
      setIsLargeScreen(window.matchMedia('(min-width: 1024px)').matches); // lg
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Load poster + comments when posterId changes
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

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  async function addComment() {
    if (!newComment.trim()) return;

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        posterId,
        page: commentTargetPage,
        text: newComment.trim(),
        author: 'Anonymous',
      }),
    });

    if (!res.ok) {
      alert('Failed to save comment');
      return;
    }

    const saved = await res.json();
    setComments((prev) => [
      ...prev,
      { ...saved, timestamp: new Date(saved.timestamp) },
    ]);

    setNewComment('');
    setShowCommentModal(false);
  }

  const pdfUrl = useMemo(
    () => poster?.fileUrl || poster?.filepath || '',
    [poster]
  );

  const pageComments = useMemo(
    () => comments.filter((c) => c.page === commentTargetPage),
    [comments, commentTargetPage]
  );

  // Widths
  const centerPageWidth = useMemo(() => {
    if (typeof window === 'undefined') return 700;
    // Center column: give it room but don’t overflow
    if (isLargeScreen) return Math.min(1100, Math.floor(window.innerWidth * 0.52));
    // Small screen single-page width (used rarely here)
    return Math.min(900, window.innerWidth - 24);
  }, [isLargeScreen]);

  const thumbWidth = 160;

  const ZOOM_EPS = 0.02;
  const updateZoomed = (scale: number) => setIsZoomed(scale > 1 + ZOOM_EPS);

  // Small-screen: observe pages to keep “current page” in sync while scrolling
  useEffect(() => {
    if (isLargeScreen) return;
    if (!numPages) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Pick the most-visible intersecting entry
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];

        if (!visible) return;
        const page = Number((visible.target as HTMLElement).dataset.page || '1');
        if (page && page !== pageNumber) setPageNumber(page);
      },
      {
        root: null,
        threshold: [0.55, 0.7, 0.85],
      }
    );

    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current[i];
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeScreen, numPages]);

  // Loading state
  if (!poster) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <Link href="/" className="text-blue-600">← Back</Link>

        <div className="mt-6 bg-white p-6 rounded shadow">
          <p>Loading presentation…</p>
          {error && <p className="text-red-600 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

// LEFT NAV (DESKTOP): thumbnail-sized mini PDF pages for navigation
const MiniPdfNav = () => {
  const listRef = useRef<List>(null);

  // Thumbnail sizing (laptop)
  const THUMB_W = 220;     // width of the mini page
  const ROW_H = 170;       // row height (must be >= thumb height + label)

  // Keep left nav centered around the currently selected slide
  useEffect(() => {
    if (!isLargeScreen) return;
    if (!numPages) return;
    listRef.current?.scrollToItem(pageNumber - 1, 'center');
  }, [pageNumber, isLargeScreen, numPages]);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="p-3 border-b bg-white">
        <div className="text-sm font-semibold">Slides</div>
        <div className="text-xs text-gray-500">Click a slide to jump</div>
      </div>

      {/* Virtualized list */}
      <div className="flex-1 overflow-hidden">
        <List
          ref={listRef}
          height={typeof window === 'undefined' ? 600 : window.innerHeight - 160}
          itemCount={numPages}
          itemSize={ROW_H}
          width="100%"
        >
          {({ index, style }) => {
            const n = index + 1;
            const active = n === pageNumber;

            return (
              <div style={style} className="p-2">
                <button
                  onClick={() => {
                    setPageNumber(n);        // move center PDF
                    setCommentTargetPage(n); // keep comments synced
                  }}
                  className={[
                    'w-full rounded-lg border bg-white overflow-hidden text-left',
                    active ? 'border-blue-600 ring-2 ring-blue-200' : 'border-gray-200',
                  ].join(' ')}
                  title={`Go to slide ${n}`}
                >
                  {/* Mini PDF page */}
                  <div className="flex justify-center bg-white">
                    <Document file={pdfUrl}>
                      <Page
                        pageNumber={n}
                        width={THUMB_W}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                  </div>

                  {/* Label */}
                  <div className="px-2 py-1 text-xs text-gray-600 flex justify-between border-t bg-white">
                    <span>Slide {n}</span>
                    {active && <span className="text-blue-600">●</span>}
                  </div>
                </button>
              </div>
            );
          }}
        </List>
      </div>
    </div>
  );
};

  };


  // Shared: comments panel
  const CommentsPanel = ({ compactHeader }: { compactHeader?: boolean }) => (
    <div className="h-full flex flex-col bg-white">
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Comments</div>
            <div className="text-xs text-gray-500">
              Slide {commentTargetPage} of {numPages || '…'}
            </div>
          </div>

          <button
            onClick={() => {
              setCommentTargetPage(pageNumber);   // pin the slide
              setShowCommentModal(true);          // then open the box
            }}
            className="bg-green-600 text-white px-3 py-2 rounded text-sm"
          >
            Add
          </button>

        </div>

        {!compactHeader && (
          <div className="mt-2 text-xs text-gray-500">
            {loadingComments
              ? 'Loading comments…'
              : `${pageComments.length} comment${pageComments.length !== 1 ? 's' : ''} on this slide`}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
        {loadingComments ? (
          <p className="text-sm text-gray-600">Loading comments…</p>
        ) : pageComments.length === 0 ? (
          <p className="text-sm text-gray-600">No comments yet on this slide.</p>
        ) : (
          <div className="space-y-3">
            {pageComments.map((c) => (
              <div key={getId(c)} className="border rounded p-3 bg-white">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-gray-900">{c.author}</span>
                  <span className="text-gray-500">
                    {c.timestamp.toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-900">{c.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar (always visible) */}
      <div className="sticky top-0 z-40 bg-white border-b">
        <div className="mx-auto max-w-6xl px-3 py-2 flex items-center justify-between gap-3">
          <Link href="/" className="text-blue-600 text-sm">
            ← Back
          </Link>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{poster.title || 'Untitled'}</div>
            <div className="truncate text-xs text-gray-500">{poster.author ? `by ${poster.author}` : ''}</div>
          </div>

          <button
            onClick={handleDelete}
            className="bg-red-600 text-white px-3 py-2 rounded text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* PDF Document wrapper once (so thumbs + pages share the same loaded file) */}
      {/* LARGE SCREEN: 3-column layout */}
      <div className="hidden lg:grid lg:grid-cols-[260px_1fr_320px] lg:gap-4 lg:max-w-7xl lg:mx-auto lg:px-4 lg:py-4">
        {/* Left: slide drawer */}
        <div className="h-[calc(100vh-76px)] rounded-lg border overflow-hidden bg-white">
          <MiniPdfNav />
        </div>

        {/* Center: single selected slide (pinch zoom + pan) */}
        <div className="h-[calc(100vh-76px)] rounded-lg border bg-white overflow-hidden">
          <div className="h-full overflow-auto" style={{ touchAction: 'pan-y pinch-zoom' }}>
            <div className="p-3 border-b flex items-center justify-between">
              <div className="text-sm">
                Slide <span className="font-semibold">{pageNumber}</span> of{' '}
                <span className="font-semibold">{numPages || '…'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
                >
                  Prev
                </button>
                <button
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                  className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="p-3" style={{ touchAction: 'pan-y pinch-zoom' }}>
              <TransformWrapper
                minScale={1}
                maxScale={3}
                initialScale={1}
                wheel={{ disabled: true }}
                doubleClick={{ mode: 'reset' }}
                pinch={{ step: 5 }}
                // don’t consume 1-finger gestures unless zoomed
                panning={{ disabled: !isZoomed, velocityDisabled: true }}
                onZoomStart={() => setIsZoomed(true)}
                onZoomStop={({ state }) => updateZoomed(state.scale)}
                onPanningStop={({ state }) => updateZoomed(state.scale)}
                onPinchingStop={({ state }) => updateZoomed(state.scale)}
              >
                <TransformComponent wrapperStyle={{ width: '100%' }} contentStyle={{ width: '100%' }}>
                  <div className="w-full flex justify-center">
                    <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
                      <Page
                        pageNumber={pageNumber}
                        width={centerPageWidth}
                        renderTextLayer={false}
                        className="mx-auto"
                      />
                    </Document>
                  </div>
                </TransformComponent>


              </TransformWrapper>

              <div className="mt-2 text-xs text-gray-500">
                Tip: pinch to zoom, drag to pan (when zoomed), double-tap to reset.
              </div>
            </div>
          </div>
        </div>

        {/* Right: comments */}
        <div className="h-[calc(100vh-76px)] rounded-lg border overflow-hidden">
          <CommentsPanel />
        </div>
      </div>

      {/* SMALL SCREEN: vertical scroll of all pages */}
      <div className="lg:hidden">
        {/* floating buttons */}
        <button
          onClick={() => setShowSlideDrawerMobile(true)}
          className="fixed left-3 bottom-4 z-50 bg-white border shadow px-4 py-3 rounded-full text-sm"
        >
          ☰ Slides
        </button>

        <div className="px-2 py-3">
          <div className="text-center text-xs text-gray-500 mb-2">
            Scrolling updates current slide: <span className="font-semibold">{pageNumber}</span> / {numPages || '…'}
            {isLandscape ? ' (landscape)' : ''}
          </div>

          <div className="space-y-4">
            {Array.from({ length: numPages }, (_, idx) => {
              const n = idx + 1;
              return (
                <div
                  key={n}
                  ref={(el) => { pageRefs.current[n] = el; }}
                  data-page={n}
                  className={[
                    'bg-white rounded-lg border overflow-hidden',
                    n === pageNumber ? 'border-blue-600 ring-1 ring-blue-200' : 'border-gray-200',
                  ].join(' ')}
                >
                  <div
                    className="px-3 py-2 border-b text-sm font-semibold flex items-center justify-between"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCommentTargetPage(n);                 // this is the slide we are commenting on
                      setMobileSlideMenu((prev) =>
                        prev?.open && prev.page === n ? null : { open: true, page: n }
                      );
                      // show menu for THIS slide
                    }}
                  >
                    <span>Slide {n}</span>
                    {mobileSlideMenu?.open && mobileSlideMenu.page === n ? (
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs px-2 py-1 rounded bg-gray-100 font-normal"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCommentsDrawerMobile(true);
                            setMobileSlideMenu(null);
                          }}
                        >
                          View
                        </button>

                        <button
                          className="text-xs px-2 py-1 rounded bg-green-600 text-white font-normal"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCommentModal(true);
                            setMobileSlideMenu(null);
                          }}
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500 font-normal">Tap for comments</span>
                    )}

                  </div>


                  {/* NOTE: keeping this simple/reliable: native scroll + no swipe conflicts.
                       If you later want pinch zoom per page, we can add a “tap to focus/zoom” mode. */}
                  <div style={{ touchAction: 'pan-y pinch-zoom' }}>
                    <Document file={pdfUrl}>
                      <Page
                        pageNumber={n}
                        width={typeof window === 'undefined' ? 380 : Math.min(900, window.innerWidth - 16)}
                        renderTextLayer={false}
                        className="mx-auto"
                      />
                    </Document>

                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile slide drawer overlay */}
        {showSlideDrawerMobile && (
          <div className="fixed inset-0 z-50" onClick={() => setShowSlideDrawerMobile(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <SlideDrawer onPick={() => setShowSlideDrawerMobile(false)} />
            </div>
          </div>
        )}

        {/* Mobile comments drawer overlay */}
        {showCommentsDrawerMobile && (
          <div className="fixed inset-0 z-50" onClick={() => setShowCommentsDrawerMobile(false)}>
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute right-0 top-0 bottom-0 w-[90%] max-w-[380px] bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <CommentsPanel compactHeader />
            </div>
          </div>
        )}
      </div>


      {/* Comment modal: works everywhere */}
      {showCommentModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowCommentModal(false)}
        >
          <div
            className="bg-white rounded p-6 max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-3">
              Add Comment (Slide {commentTargetPage})
            </h2>

            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={5}
              className="w-full border rounded p-2 mb-3 text-gray-900 placeholder-gray-400"
              placeholder="Your comment…"
              autoFocus
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCommentModal(false);
                  setNewComment('');
                }}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={addComment}
                disabled={!newComment.trim()}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-300"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
