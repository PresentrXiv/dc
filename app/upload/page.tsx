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
      const file = fileRef.current?.files?.[0];
      if (!file) throw new Error('Please choose a PDF file.');
      if (file.type !== 'application/pdf') throw new Error('File must be a PDF.');
      if (!title.trim()) throw new Error('Title is required.');

      setStatus('Uploading PDF…');

      // 1) Upload PDF directly to Vercel Blob
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/posters/upload',
      });

      if (!blob?.url) {
        throw new Error('Blob upload did not return a URL.');
      }

      setStatus('Saving metadata…');

      // 2) Save poster metadata (including fileUrl) to MongoDB
      const res = await fetch('/api/posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          fileUrl: blob.url,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to save poster (${res.status})`);
      }

      setStatus('Done! Redirecting…');
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
            placeholder="e.g., My conference talk"
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
    </div>
  );
}
