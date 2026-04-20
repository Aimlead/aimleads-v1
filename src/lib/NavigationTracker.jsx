import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { dataClient } from '@/services/dataClient';

export default function NavigationTracker() {
  const location = useLocation();
  const lastTrackedPathRef = useRef('');

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    if (!path || lastTrackedPathRef.current === path) return;

    lastTrackedPathRef.current = path;

    const send = () => dataClient.public.trackEvent({
      event: 'page_view',
      path,
      source: 'navigation_tracker',
      properties: {
        title: typeof document !== 'undefined' ? document.title : '',
        referrer: typeof document !== 'undefined' ? document.referrer : '',
      },
    }).catch(() => {});

    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(send, { timeout: 2000 });
    } else {
      setTimeout(send, 0);
    }
  }, [location.pathname, location.search]);

  return null;
}
