'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const PosterViewer = dynamic(
  () => import('@/app/components/PosterViewer'),
  { ssr: false }
);

export default function ViewPosterPage() {
  const params = useParams();
  const posterId = params.id as string;

  return <PosterViewer posterId={posterId} />;
}