'use client';

import dynamic from 'next/dynamic';

const PosterViewer = dynamic(() => import('@/app/components/PosterViewer'), {
  ssr: false,
});

export default function ViewPosterClient({ posterId }: { posterId: string }) {
  return <PosterViewer posterId={posterId} />;
}
