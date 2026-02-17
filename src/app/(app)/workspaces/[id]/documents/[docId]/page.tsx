'use client';

import DocumentViewerShell from '@/components/document/DocumentViewerShell';

export default function DocumentViewerPage() {
  return <DocumentViewerShell initialMode="chat" initialPaneOpen={false} />;
}
