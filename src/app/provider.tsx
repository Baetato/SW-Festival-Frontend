// src/app/provider.tsx
'use client';

import { useEffect } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  return <>{children}</>;
}
