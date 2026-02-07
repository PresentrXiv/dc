'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Document, Page, pdfjs } from 'react-pdf';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

type Poster = {
  id: string;
  title?: string;
  author?: string;
  fileUrl?: string;   // Vercel Blob
  filepath?: string;  // old local files
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

export default function PosterViewer({ posterId }: { posterId: string }) {
  const router = useRouter();

  const [poster, setPoster] = useState<Poster | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);

  const [showCommentModal, setShowCommentModal] = useState(false);
  const [newComment, setNewComment] = useState('');

  const [error, setError] = useState('');

  const [deleting, setDeleting] = useState(false);

  // Configure pdf.js worker (browser only)
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc =
      `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }, []);

  useEffect(() => {
    fetchPoster();
    fetchComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posterId]);

  async function fetchPoster() {
    try {
      setError('');
      setPoster(null);

      if (!posterId) {
        setError('posterId is missing');
        return;
      }

      const res = await fetch(`/api/posters/${posterId}`);
      if (!res.ok) {
        setError(`Failed to load poster (${res.status})`);
        return;
      }

      const data = await res.json();

      // Defensive: if wrong endpoint was hit
      if (Array.isArray(data)) {
        setError('Expected single poster, got array');
        return;
      }

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
      const withDates: Comment[] = (data || []).map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }));
      setComments(withDates);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoadingComments(false);
    }
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  async function addComment() {
    if (!newComment.trim()) return;

    const payload = {
      posterId,
      page: pageNumber,
      text: newComment.trim(),
      author: 'Anonymous',
    };

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        alert('Failed to save comment. Please try again.');
        return;
      }

      const saved = await res.json();

      setComments((prev) => [
        ...prev,
        { ...saved, timestamp: new Date(saved.timestamp) },
      ]);

      setNewComment('');
      setShowCommentModal(false);
    } catch (err) {
      console.error('Error saving comment:', err);
      alert('Failed to save comment. Please try again.');
    }
  }

  async function deletePoster() {
    if (!posterId) return;
    if (!confirm('Delete this presentation?')) return;

    try {
      setDeleting(true);

      const res = await fetch(`/api/posters/${posterId}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(j?.error ?? 'Delete failed');
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const pdfUrl = useMemo(() => {
    return poster?.fileUrl || poster?.filepath || '';
  }, [poster]);

  const pageComments = useMemo(
    () => comments.filter((c) => c.page === pageNumber),
    [comments, pageNumber]
  );

  if (!poster) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            ← Back to All Presentations
          </Link>

          <button
            onClick={deletePoster}
            disabled
            className="px-3 py-2 rounded bg-red-600 text-white font-semibold opacity-50 cursor-not-allowed"
            title="Load the poster first"
          >
            Delete
          </button>
        </div>

        <div className="mt-6 bg-white p-6 rounded shadow">
          <p>Loading presentation…</p>
          {error && (
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded">
              {error}
            </p>
          )}
          <div className="mt-2 text-xs text-gray-500">
            Debug: posterId={posterId || '(empty)'}
          </div>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            ← Back to All Presentations
          </Link>

          <button
            onClick={deletePoster}
            disabled={deleting}
            className="px-3 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        <div className="mt-6 bg-white p-6 rounded shadow">
          <h1 className="text-xl font-bold">{poster.title || '(no title)'}</h1>
          <p className="text-gray-600">by {poster.author || '(no author)'}</p>

          <p className="mt-6 text-gray-500">No PDF file specified.</p>

          <div className="mt-2 text-xs text-gray-500 break-all">
            Debug keys: {Object.keys(poster).join(', ')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 md:p-8 max-w-5xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            ← Back to All Presentations
          </Link>

          <button
            onClick={deletePoster}
            disabled={deleting}
            className="px-3 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-4 mb-2">
          <h1 className="text-2xl md:text-3xl font-bold">{poster.title}</h1>
          <p className="text-gray-600 mt-1">by {poster.author}</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="border rounded overflow-hidden bg-white mb-4">
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess}>
              <Page
                pageNumber={pageNumber}
                width={
                  typeof window !== 'undefined'
                    ? Math.min(900, window.innerWidth - 64)
                    : 600
                }
                renderTextLayer={false}
                className="mx-auto"
              />
            </Document>
          </div>

          <div className="flex gap-3 items-center justify-center flex-wrap mb-4">
            <button
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber((p) => p - 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>

            <span className="font-medium px-4">
              Slide {pageNumber} of {numPages}
            </span>

            <button
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber((p) => p + 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>

          <div className="border-t pt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-600">
              {loadingComments ? (
                <span>Loading comments...</span>
              ) : (
                <>
                  {pageComments.length} comment{pageComments.length !== 1 ? 's' : ''} on this slide
                  {comments.length > 0 && (
                    <span className="ml-2">• {comments.length} total</span>
                  )}
                </>
              )}
            </div>

            <button
              onClick={() => setShowCommentModal(true)}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
            >
              💬 Add Comment
            </button>
          </div>

          {!loadingComments && pageComments.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold text-lg">
                Comments on Slide {pageNumber}:
              </h3>

              {pageComments.map((comment) => (
                <div
                  key={comment._id || comment.id}
                  className="p-4 bg-gray-50 border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <span className="font-semibold text-blue-700">
                      {comment.author}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {comment.timestamp.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-800 whitespace-pre-wrap">
                    {comment.text}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 text-xs text-gray-500 break-all">
            Debug pdfUrl: {pdfUrl}
          </div>
        </div>
      </div>

      {showCommentModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowCommentModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">
                  Add Comment to Slide {pageNumber}
                </h2>
                <button
                  onClick={() => setShowCommentModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your comment:
                </label>
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Share your thoughts about this slide..."
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-900 placeholder-gray-400"
                  rows={6}
                  autoFocus
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowCommentModal(false);
                    setNewComment('');
                  }}
                  className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={addComment}
                  disabled={!newComment.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  Post Comment
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                💡 Text highlighting coming soon
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
