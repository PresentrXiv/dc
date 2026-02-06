'use client';

import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';

export default function UploadPage() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string>('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError('');
    setStatus('');
    setBusy(true);

    try {
      // --- Basic validation ---
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Please choose a PDF file.');
      if (file.type !== 'application/pdf') throw new Error('File must be a PDF.');
      if (!title.trim()) throw new Error('Title is required.');

      setStatus('Uploading PDF to storage…');

      // 1) Upload file directly to Vercel Blob (client upload)
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/posters/upload',
      });

      setStatus('Saving poster metadata…');

      // 2) Save metadata (including blob URL) to MongoDB via your API
      const res = await fetch('/api/posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          fileUrl: blob.url,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to save poster (${res.status})`);
      }

      setStatus('Done! Redirecting…');

      // 3) Go back to home page (browse posters)
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Upload a Presentation</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Title *</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Intra-pandemic Evolution of SARS-CoV-2"
            required
            disabled={busy}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Author</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="e.g., Bob Morris"
            disabled={busy}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">PDF File *</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="block w-full text-sm"
            disabled={busy}
          />
          <p className="text-xs text-gray-500 mt-1">
            Choose a PDF presentation to upload.
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-red-800 text-sm">
            {error}
          </div>
        )}

        {status && (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-gray-800 text-sm">
            {status}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className={[
            'w-full rounded px-4 py-2 font-medium transition',
            busy
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-black text-white hover:bg-gray-900',
          ].join(' ')}
        >
          {busy ? 'Uploading…' : 'Upload Presentation'}
        </button>
      </form>

      <div className="mt-6 text-xs text-gray-500 space-y-1">
        <div>
          If the button never changes to “Uploading…”, it usually means the page is
          not running as a client component. This file includes <code>'use client'</code>{' '}
          at the top, which is required.
        </div>
        <div>
          The upload token route must exist at: <code>/api/posters/upload</code>.
        </div>
      </div>
    </div>
  );
}
