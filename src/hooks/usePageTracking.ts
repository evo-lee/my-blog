import { useEffect } from 'react';
import { useLocation } from 'react-router';

// Google Analytics 4 SPA page tracking
function trackGA4PageView(path: string, title: string) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: title,
      page_location: window.location.href,
    });
  }
}

// Umami SPA page tracking
function trackUmamiPageView(path: string) {
  const umami = (window as any).umami;
  if (typeof umami?.track === 'function') {
    umami.track({
      url: path,
      referrer: document.referrer,
    });
  }
}

export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;
    const title = document.title;

    // Small delay to ensure title has updated
    const timer = setTimeout(() => {
      trackGA4PageView(path, title);
      trackUmamiPageView(path);
    }, 100);

    return () => clearTimeout(timer);
  }, [location]);
}
