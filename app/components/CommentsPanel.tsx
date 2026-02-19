'use client';

import React from 'react';

export type Comment = {
  _id?: string;
  id?: string;
  posterId: string;
  page: number;
  text: string;
  author?: string;
  timestamp: Date;
};


function getId(c: Comment) {
  return c._id || c.id || `${c.posterId}-${c.page}-${c.timestamp.toISOString()}`;
}
type CommentsPanelProps = {
  compactHeader?: boolean;
  page: number;
  numPages: number;
  loading: boolean;
  comments: Comment[];
  onOpenAdd: () => void;
  onOpenEdit: (c: Comment) => void;
};


export default function CommentsPanel({
  compactHeader,
  page,
  numPages,
  loading,
  comments,
  onOpenAdd,
  onOpenEdit,
}: CommentsPanelProps) {


  return (
    <div className="h-full flex flex-col">
      <div className={compactHeader ? 'px-3 py-2 border-b' : 'px-4 py-3 border-b'}>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              Comments · Slide {page} / {numPages || '?'}
            </div>
          </div>

          <button
  onClick={onOpenAdd}

            className="shrink-0 rounded bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700"
          >
            Add
          </button>



        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="text-sm text-gray-500">Loading comments…</div>
        ) : comments?.length ? (
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={getId(c)} className="rounded border p-3">
                <div className="text-sm text-gray-900 whitespace-pre-wrap">{c.text}</div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-500">
                    {c.author || 'Anonymous'} • {c.timestamp?.toLocaleString?.() ?? ''}
                  </div>

                  <button
                    onClick={() => onOpenEdit(c)}
                    className="text-xs px-2 py-1 rounded border hover:bg-gray-50"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No comments on this slide yet.</div>
        )}
      </div>

      {/* no textarea here anymore */}
      <div className="border-t bg-white p-3">
        <div className="text-xs text-gray-500">
          Click <span className="font-semibold">Add</span> to write a comment for this slide.
        </div>
      </div>
    </div>
  );
}
