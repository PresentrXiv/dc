'use client';

// React basics
import { useEffect, useMemo, useState } from 'react';

// Next helpers
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// PDF rendering
import { Document, Page, pdfjs } from 'react-pdf';

// Swipe handling (left/right on mobile)
import { useSwipeable } from 'react-swipeable';

// PDF layer CSS (required by react-pdf; we disable text layer rendering but keep CSS imported)
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/**
 * Poster record as stored in MongoDB
 * (some fields optional because older data or partial records may exist)
 */
type Poster = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;   // Vercel Blob URL
  filepath?: string;  // legacy local path field (older dev)
};

/**
 * Comment record returned by /api/comments
 * timestamp comes back as a string; we convert to Date for display
 */
type Comment = {
  _id?: string;
  id?: string;
  posterId: string;
  page: number;
  text: string;
  author: string;
  timestamp: Date;
};

/**
 * PosterViewer is the main "view a deck" page UI.
 * It:
 * - loads poster metadata (title/author/pdf URL)
 * - renders the PDF
 * - supports swipe navigation on mobile
 * - loads and adds comments
 * - deletes the poster
 */
export default function PosterViewer({ posterId }: { posterId: string }) {
  // Router lets us programmatically navigate (push back to / after delete)
  const router = useRouter();

  // Poster metadata loaded from /api/posters/[id]
  const [poster, setPoster] = useState<Poster | null>(null);

  // PDF state
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);

  // Comment modal UI state
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [newComment, setNewComment] = useState('');

  // Error message for poster load failures
  const [error, setError] = useState('');

  /**
   * Configure pdf.js worker on the client.
   * react-pdf requires a worker script; this points to a hosted version.
   */
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  /**
   * Whenever posterId changes (navigating to a different poster),
   * re-fetch poster metadata and comments.
   */
  useEffect(() => {
    fetchPoster();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  /**
   * Fetch the poster metadata from the API.
   * This gives us title/author and PDF URL (fileUrl).
   */
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

  /**
   * Fetch comments for this poster. Comments API returns timestamps as strings,
   * so we convert to Date objects for display.
   */
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

  /**
   * Delete this poster (soft-delete in Mongo via /api/posters/[id] DELETE),
   * then navigate back to the home list.
   */
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

  /**
   * react-pdf calls this once the PDF is loaded.
   * We store total pages and reset to the first slide.
   */
  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  /**
   * Add a comment for the current slide (pageNumber).
   * Posts JSON to /api/comments, then appends to local state.
   */
  async function addComment() {
    if (!newComment.trim()) return;

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        posterId,
        page: pageNumber,
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

  /**
   * Determine which URL to render:
   * - Prefer fileUrl (Blob)
   * - Fall back to filepath (legacy)
   */
  const pdfUrl = useMemo(
    () => poster?.fileUrl || poster?.filepath || '',
    [poster]
  );

  /**
   * Filter comments to only those on the currently viewed slide.
   */
  const pageComments = useMemo(
    () => comments.filter((c) => c.page === pageNumber),
    [comments, pageNumber]
  );

  /**
   * Swipe behavior:
   * - Swipe left → next page
   * - Swipe right → previous page
   *
   * The delta value reduces accidental triggers.
   * preventScrollOnSwipe helps stop the browser from treating it as scroll.
   */
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => setPageNumber((p) => (p < numPages ? p + 1 : p)),
    onSwipedRight: () => setPageNumber((p) => (p > 1 ? p - 1 : p)),
    delta: 30,
    trackTouch: true,
    preventScrollOnSwipe: true,
  });

  /**
   * Loading state: poster metadata not loaded yet.
   */
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

  /**
   * Main UI
   */
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl p-4 md:p-8">

        {/* Header bar with Back + Delete */}
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" className="text-blue-600">
            ← Back to All Presentations
          </Link>

          <button
            onClick={handleDelete}
            className="bg-red-600 text-white px-3 py-2 rounded font-semibold hover:bg-red-700"
          >
            Delete
          </button>
        </div>

        {/* Title/author card */}
        <div className="bg-white rounded-lg shadow p-4 mb-4">
          <h1 className="text-2xl font-bold">{poster.title}</h1>
          <p className="text-gray-600">by {poster.author}</p>
        </div>

        {/* PDF viewer container:
            - swipeHandlers attached to this div
            - touchAction pan-y allows vertical scroll but captures horizontal swipe */}
        <div
          {...swipeHandlers}
          className="bg-white rounded shadow p-4 mb-4 touch-pan-y"
          style={{ touchAction: 'pan-y' }}
        >
          <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page
              pageNumber={pageNumber}
              // width logic keeps PDF readable on phones
              width={
                typeof window !== 'undefined'
                  ? Math.min(900, window.innerWidth - 32)
                  : 600
              }
              renderTextLayer={false}
              className="mx-auto"
            />
          </Document>
        </div>

        {/* Desktop navigation buttons (hidden on small screens) */}
        <div className="hidden sm:flex items-center justify-center gap-4 mb-4">
          <button
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300"
          >
            ← Previous
          </button>

          <span>
            Slide {pageNumber} of {numPages}
          </span>

          <button
            disabled={pageNumber >= numPages}
            onClick={() => setPageNumber((p) => p + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-300"
          >
            Next →
          </button>
        </div>

        {/* Mobile hint (visible only on small screens) */}
        <p className="sm:hidden text-center text-xs text-gray-500 mb-4">
          Swipe left or right to change slides
        </p>

        {/* Comments header + add button */}
        <div className="border-t pt-4 flex justify-between items-center">
          <span className="text-sm text-gray-600">
            {loadingComments
              ? 'Loading comments...'
              : `${pageComments.length} comment${pageComments.length !== 1 ? 's' : ''} on this slide`}
          </span>

          <button
            onClick={() => setShowCommentModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Add Comment
          </button>
        </div>

        {/* Comments list for the current slide */}
        {!loadingComments && pageComments.length > 0 && (
          <div className="mt-4 space-y-3">
            {pageComments.map((c) => (
              <div key={c._id || c.id} className="border rounded p-3 bg-gray-50">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold">{c.author}</span>
                  <span className="text-gray-500">
                    {c.timestamp.toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{c.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comment modal overlay */}
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
              Add Comment (Slide {pageNumber})
            </h2>

            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={5}
              className="w-full border rounded p-2 mb-3"
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

            <p className="text-xs text-gray-500 mt-3">
              Tip: swipe left/right on the PDF to move between slides.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
