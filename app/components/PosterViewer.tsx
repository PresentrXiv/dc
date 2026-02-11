'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';
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


  // Comment modal
  const [newComment, setNewComment] = useState('');

  // Responsive
  const [isLandscape, setIsLandscape] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Mobile overlays
  const [showCommentsDrawerMobile, setShowCommentsDrawerMobile] = useState(false);

  // Zoom state (desktop center)
  const [isZoomed, setIsZoomed] = useState(false);

  // Track mobile scrolling (current page)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Center page width (measured from actual container)
  const centerViewerRef = useRef<HTMLDivElement | null>(null);
  const [centerPageWidth, setCenterPageWidth] = useState<number>(900);

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

  // Measure center viewer width (desktop)
  useEffect(() => {
    const el = centerViewerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth; // already excludes scrollbar
      setCenterPageWidth(Math.max(320, w));
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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

  // IMPORTANT: only sets numPages; does not reset pageNumber
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);

    // Keep current page in bounds
    setPageNumber((prev) => (prev < 1 ? 1 : prev > numPages ? numPages : prev));
    setCommentTargetPage((prev) => (prev < 1 ? 1 : prev > numPages ? numPages : prev));
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
    setComments((prev) => [...prev, { ...saved, timestamp: new Date(saved.timestamp) }]);
    setNewComment('');
  }

  // Mobile: observe pages to keep current slide
  useEffect(() => {
    if (isLargeScreen) return;
    if (!numPages) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))[0];
        if (!visible) return;

        const page = Number((visible.target as HTMLElement).dataset.page || '1');
        if (page && page !== pageNumber) setPageNumber(page);
      },
      { threshold: [0.55, 0.7, 0.85] }
    );

    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current[i];
      if (el) observerRef.current.observe(el);
    }

    return () => observerRef.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeScreen, numPages]);

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

  // Mini thumbnails component (used desktop + optionally mobile drawer)
  const MiniNav = ({ onPick }: { onPick?: () => void }) => {
    const THUMB_W = 220;

    return (
      <div className="h-full flex flex-col bg-gray-50">
        <div className="p-3 border-b bg-white">
          <div className="text-sm font-semibold">Slides</div>
          <div className="text-xs text-gray-500">Click a slide to jump</div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: numPages }, (_, index) => {
            const n = index + 1;
            const active = n === pageNumber;

            return (
              <div
                key={n}
                ref={(el) => {
                  pageRefs.current[n] = el;
                }}
                data-page={n}
                className={[
                  'bg-white rounded-lg border overflow-hidden',
                  n === pageNumber ? 'border-blue-600 ring-1 ring-blue-200' : 'border-gray-200',
                ].join(' ')}
              >
                {/* Header: tap opens comments mode */}
                <div
                  className="px-3 py-2 border-b text-sm font-semibold flex items-center justify-between"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCommentTargetPage(n);
                    setShowCommentsDrawerMobile(true);
                  }}
                >
                  <span>Slide {n}</span>
                  <span className="text-xs text-gray-500 font-normal">Comments</span>
                </div>

                {/* Slide */}
                <div style={{ touchAction: 'pan-y pinch-zoom' }}>
                  <Page
                    pageNumber={n}
                    width={typeof window === 'undefined' ? 380 : Math.min(900, window.innerWidth - 16)}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    className="mx-auto"
                  />
                </div>
              </div>
            );

          })}
        </div>
      </div>
    );
  };

  // Comments panel
  const CommentsPanel = ({
    compactHeader,
    page,
    numPages,
    loading,
    comments,
    onAdd,
  }: {
    compactHeader?: boolean;
    page: number;
    numPages: number;
    loading: boolean;
    comments: Comment[];
    onAdd: () => void;
  }) => (
    <div className="h-full flex flex-col bg-white">
      <div className={compactHeader ? 'px-3 py-2 border-b' : 'px-4 py-3 border-b'}>
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">
            Comments — Slide {page}
            {numPages > 0 ? ` / ${numPages}` : ''}
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="text-sm text-gray-500 py-4">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">No comments yet.</div>
        ) : (
          <div className="space-y-3 py-3">
            {comments.map((c) => (
              <div key={getId(c)} className="rounded-lg border p-3">
                <div className="text-sm text-gray-900 whitespace-pre-wrap">{c.text}</div>
                <div className="mt-2 text-xs text-gray-500">
                  {c.author || 'Anonymous'} • {c.timestamp ? c.timestamp.toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // IMPORTANT: Single Document wraps everything that needs PDF pages
  return (
    <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
      <div className="min-h-screen bg-gray-50">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white border-b">
          <div className="mx-auto max-w-6xl px-3 py-2 flex items-center justify-between gap-3">
            <Link href="/" className="text-blue-600 text-sm">
              ← Back
            </Link>

            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{poster.title || 'Untitled'}</div>
              <div className="truncate text-xs text-gray-500">{poster.author ? `by ${poster.author}` : ''}</div>
            </div>

            <button onClick={handleDelete} className="bg-red-600 text-white px-3 py-2 rounded text-sm">
              Delete
            </button>
          </div>
        </div>

        {/* DESKTOP */}
        <div className="hidden lg:grid lg:grid-cols-[260px_1fr_320px] lg:gap-4 lg:max-w-7xl lg:mx-auto lg:px-4 lg:py-4">
          {/* Left nav */}
          <div className="h-[calc(100vh-76px)] rounded-lg border overflow-hidden bg-white">
            {numPages > 0 ? <MiniNav /> : <div className="p-4 text-sm text-gray-500">Loading…</div>}
          </div>

          {/* Center viewer */}
          <div className="h-[calc(100vh-76px)] rounded-lg border bg-white">
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
                    disabled={numPages === 0 || pageNumber >= numPages}
                    onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm disabled:bg-gray-300"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="p-3" ref={centerViewerRef}>
                <TransformWrapper
                  minScale={1}
                  maxScale={3}
                  initialScale={1}
                  wheel={{ disabled: true }}
                  doubleClick={{ mode: 'reset' }}
                  pinch={{ step: 5 }}
                  panning={{ disabled: !isZoomed, velocityDisabled: true }}
                  onZoomStart={() => setIsZoomed(true)}
                  onZoomStop={({ state }) => setIsZoomed(state.scale > 1.02)}
                  onPanningStop={({ state }) => setIsZoomed(state.scale > 1.02)}
                  onPinchingStop={({ state }) => setIsZoomed(state.scale > 1.02)}
                >
                  <TransformComponent wrapperStyle={{ width: '100%' }} contentStyle={{ width: '100%' }}>
                    <div className="w-full flex justify-center">
                      <Page
                        pageNumber={pageNumber}
                        width={centerPageWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                        className="mx-auto"
                      />
                    </div>
                  </TransformComponent>
                </TransformWrapper>

                
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
              onAdd={() => {
                setCommentTargetPage(pageNumber);
              }}
            />
          </div>
        </div>

        {/* MOBILE */}
        <div className="lg:hidden">


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
        ref={(el) => {
          pageRefs.current[n] = el;
        }}
        data-page={n}
        className={[
          'bg-white rounded-lg border overflow-hidden',
          n === pageNumber
            ? 'border-blue-600 ring-1 ring-blue-200'
            : 'border-gray-200',
        ].join(' ')}
      >
        {/* Header: tap to open comments */}
        <div
          className="px-3 py-2 border-b text-sm font-semibold flex items-center justify-between"
          onClick={(e) => {
            e.stopPropagation();
            setCommentTargetPage(n);
            setShowCommentsDrawerMobile(true);
          }}
        >
          <span>Slide {n}</span>
          <span className="text-xs text-gray-500 font-normal">
            Comments
          </span>
        </div>

        {/* Slide content */}
        <div style={{ touchAction: 'pan-y pinch-zoom' }}>
          <Page
            pageNumber={n}
            width={
              typeof window === 'undefined'
                ? 380
                : Math.min(900, window.innerWidth - 16)
            }
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="mx-auto"
          />
        </div>
      </div>
    );
  })}
</div>





        {/* Mobile comments drawer */}
        {showCommentsDrawerMobile && (
          <div className="fixed inset-0 z-50 bg-white">
            <div className="sticky top-0 z-10 border-b bg-white px-4 py-3 flex items-center justify-between">
              <div className="font-semibold text-sm">Comments — Slide {commentTargetPage}</div>
              <button
                className="text-sm px-3 py-1.5 rounded-md border"
                onClick={() => setShowCommentsDrawerMobile(false)}
              >
                Close
              </button>
            </div>

            <div className="px-4 py-3 overflow-y-auto" style={{ height: 'calc(100vh - 160px)' }}>
              {/* list comments */}
              {loadingComments ? (
                <div className="text-sm text-gray-500">Loading…</div>
              ) : pageComments.length === 0 ? (
                <div className="text-sm text-gray-500">No comments yet.</div>
              ) : (
                <div className="space-y-3">
                  {pageComments.map((c) => (
                    <div key={getId(c)} className="rounded-lg border p-3">
                      <div className="text-sm whitespace-pre-wrap">{c.text}</div>
                      <div className="mt-2 text-xs text-gray-500">
                        {c.author || 'Anonymous'} • {c.timestamp?.toLocaleString?.() ?? ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t bg-white p-3">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                className="w-full border rounded p-2 text-gray-900 placeholder-gray-400"
                placeholder="Write a comment…"
              />
              <div className="flex justify-end mt-2">
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
    </div>
  );
}

