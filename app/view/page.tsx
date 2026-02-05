'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';

const PDFViewer = dynamic(
  () => import('../components/PDFviewer'),
  { ssr: false }
);

export default function ViewPage() {
  return <PDFViewer />;
}