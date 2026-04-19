import React, { useEffect, useState } from 'react';
import { HostView } from './components/HostView';
import { MobileView } from './components/MobileView';
import { ScreenView } from './components/ScreenView';

const App: React.FC = () => {
  const [route, setRoute] = useState<string>('host');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/mobile')) {
        setRoute('mobile');
      } else if (hash.startsWith('#/screen')) {
        setRoute('screen');
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
      {route === 'host' ? <HostView /> :
       route === 'screen' ? <ScreenView /> :
       <MobileView />}
    </div>
  );
};

export default App;