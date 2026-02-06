'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { put } from '@vercel/blob';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const router = useRouter();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title) {
      alert('Please select a file and enter a title');
      return;
    }

    setUploading(true);

    try {
      // Step 1: Upload PDF to Vercel Blob
      const blob = await put(`posters/${Date.now()}-${file.name}`, file, {
        access: 'public',
        token: process.env.NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN,
      });

      console.log('Blob uploaded:', blob.url);

      // Step 2: Save metadata to MongoDB (JSON only, no FormData)
      const response = await fetch('/api/posters', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim() || 'Anonymous',
          fileUrl: blob.url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Metadata save failed:', errorData);
        alert(`Failed to save poster metadata: ${errorData.error || 'Unknown error'}`);
        return;
      }

      const poster = await response.json();
      console.log('Poster saved:', poster);
      
      alert('Poster uploaded successfully!');
      router.push(`/view/${poster.id}`);
    } catch (error) {
      console.error('Error uploading:', error);
      alert(`Error uploading poster: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 md:p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-6">Upload Presentation</h1>

        <form onSubmit={handleUpload} className="bg-white rounded-lg shadow-lg p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Presentation Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Novel Mechanisms in MS Pathology"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Author/Presenter
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF File *
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              required
            />
            {file && (
              <p className="text-sm text-gray-600 mt-2">
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file || !title}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {uploading ? 'Uploading...' : 'Upload Presentation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}