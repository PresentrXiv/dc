'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const PosterViewer = dynamic(() => import('@/app/components/PosterViewer'), {
  ssr: false,
});

export default function ViewPosterClient({ posterId }: { posterId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm('Delete this presentation?')) return;

    try {
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
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="text-sm px-3 py-2 rounded border bg-white hover:bg-gray-50"
          >
            ← Back
          </button>

          <button
            onClick={handleDelete}
            className="text-sm px-3 py-2 rounded bg-red-600 text-white font-semibold hover:bg-red-700"
          >
            Delete
          </button>
        </div>

        <PosterViewer posterId={posterId} />
      </div>
    </div>
  );
}
