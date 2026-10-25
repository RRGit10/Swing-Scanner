import { useEffect, useState } from 'react';
import { useStatus } from './api/client';
import { Shell } from './components/Shell';
import { Dashboard } from './pages/Dashboard';
import { Detail } from './pages/Detail';
import { History } from './pages/History';
import { Settings } from './pages/Settings';

type Route = { page: 'signals' } | { page: 'detail'; ticker: string } | { page: 'history' } | { page: 'settings' };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const ticker = /^\/t\/([A-Za-z.]{1,10})$/.exec(path);
  if (ticker) return { page: 'detail', ticker: ticker[1]!.toUpperCase() };
  if (path === '/history') return { page: 'history' };
  if (path === '/settings') return { page: 'settings' };
  return { page: 'signals' };
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

const TITLES = { signals: 'Signals', detail: '', history: 'History', settings: 'Settings' };

export default function App() {
  const route = useRoute();
  const status = useStatus().data;
  useEffect(() => {
    document.title = `${route.page === 'detail' ? route.ticker : TITLES[route.page]} · Swing Scanner`;
  }, [route]);

  return (
    <Shell active={route.page === 'detail' ? 'signals' : route.page} status={status}>
      {route.page === 'signals' && <Dashboard status={status} />}
      {route.page === 'detail' && <Detail ticker={route.ticker} status={status} />}
      {route.page === 'history' && <History status={status} />}
      {route.page === 'settings' && <Settings />}
    </Shell>
  );
}
