import React, { useEffect, useState } from 'react';
import { HostView } from './components/HostView';
import { MobileView } from './components/MobileView';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('host');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/mobile')) {
        setRoute('mobile');
      } else {
        setRoute('host');
      }
    };

    // Initial check
    handleHashChange();

    // Listen for changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return (
    <div className="bg-gray-950 min-h-screen text-gray-100">
      {route === 'host' ? <HostView /> : <MobileView />}
    </div>
  );
};

export default App;