import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { isAdminPathname } from './admin/adminRoute';
import { initPwa } from './services/pwa';
import './index.css';

const AdminPanel = React.lazy(() => import('./admin/AdminPanel'));
const isAdminRoute = isAdminPathname(window.location.pathname);

if (!isAdminRoute) {
  initPwa();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Suspense
        fallback={
          <div className="fixed inset-0 bg-[#070b14] text-slate-300 flex items-center justify-center text-sm font-mono">
            GYROGON Admin yükleniyor...
          </div>
        }
      >
        <AdminPanel />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
