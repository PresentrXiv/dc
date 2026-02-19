'use client';

import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Comment = {
  _id?: string;
  id?: string;
  text: string;
  page: number;
  author: string;
  timestamp: Date;
};

export default function PDFViewer() {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const posterId = 'sample'; // Will make dynamic later

  // Fetch comments on load
  useEffect(() => {
    fetchComments();
  }, []);

  async function fetchComments() {
    try {
      const response = await fetch(`/api/comments?posterId=${posterId}`);
      if (response.ok) {
        const data = await response.json();
        // Convert timestamp strings back to Date objects
        const commentsWithDates = data.map((c: any) => ({
          ...c,
          timestamp: new Date(c.timestamp),
        }));
        setComments(commentsWithDates);
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  async function addComment() {
    if (!newComment.trim()) return;
    
    const comment = {
      posterId,
      page: pageNumber,
      text: newComment,
      author: 'Anonymous',
    };

    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comment),
      });

      if (response.ok) {
        const savedComment = await response.json();
        setComments([
          ...comments,
          {
            ...savedComment,
            timestamp: new Date(savedComment.timestamp),
          },
        ]);
        setNewComment('');
        setShowCommentModal(false);
      }
    } catch (error) {
      console.error('Error saving comment:', error);
      alert('Failed to save comment. Please try again.');
    }
  }

  const pageComments = comments.filter(c => c.page === pageNumber);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 md:p-8 max-w-5xl">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Interactive Presentation</h1>
        
        {/* PDF Viewer - Full Width */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="border rounded overflow-hidden bg-white mb-4">
            <Document
              file="/sample.pdf"
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Page 
                pageNumber={pageNumber}
                width={typeof window !== 'undefined' ? Math.min(900, window.innerWidth - 64) : 600}
                renderTextLayer={false}
                className="mx-auto"
              />
            </Document>
          </div>
          
          {/* Navigation Controls */}
          <div className="flex gap-3 items-center justify-center flex-wrap mb-4">
            <button 
              disabled={pageNumber <= 1}
              onClick={() => setPageNumber(pageNumber - 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="font-medium px-4 text-gray-700">
              Slide {pageNumber} of {numPages}
            </span>
            <button 
              disabled={pageNumber >= numPages}
              onClick={() => setPageNumber(pageNumber + 1)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>

          {/* Comment Button & Summary */}
          <div className="border-t pt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-gray-600">
              {loading ? (
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

          {/* Existing Comments on This Slide */}
          {!loading && pageComments.length > 0 && (
            <div className="mt-6 space-y-3">
              <h3 className="font-semibold text-lg">Comments on Slide {pageNumber}:</h3>
              {pageComments.map(comment => (
                <div 
                  key={comment._id || comment.id} 
                  className="p-4 bg-gray-50 border rounded-lg"
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <span className="font-semibold text-blue-700">
                      {comment.author}
                    </span>
                    <span className="text-xs text-gray-700 whitespace-nowrap">
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
        </div>
      </div>

      {/* Comment Modal */}
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
                  className="text-gray-700 hover:text-gray-700 text-2xl font-bold"
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
                <p className="text-xs text-gray-700 mt-2">
                  💡 Text highlighting coming soon
                </p>
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}