import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './components/Header';
import { EventTicker } from './components/EventTicker';
import { Dashboard } from './pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Check stored preference or default to dark
    const stored = localStorage.getItem('theme');
    if (stored === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light');

    if (newIsDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 dark:bg-slate-900 transition-colors">
      <Header isDark={isDark} onToggleTheme={toggleTheme} />
      <EventTicker />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Dashboard />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-500">
            NUST Lifeline Campaign • Built with transparency in mind
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
