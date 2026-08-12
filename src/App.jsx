import { Toaster } from "@/components/ui/toaster"
import LicenseGate from '@/components/shared/LicenseGate';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import ClientRegister from './pages/ClientRegister';
import IntuneStarterKit from './pages/IntuneStarterKit';
import IntuneAdiMigration from './pages/IntuneAdiMigration';
import AppHealthCheck from './pages/AppHealthCheck';
import AdUserMigration from './pages/AdUserMigration';
import IntuneAssistant from './pages/IntuneAssistant';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { AnimatePresence, motion } from 'framer-motion';
import React, { Suspense } from 'react';

const { Pages, Layout: PageLayout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const PageFallback = () => (
  <div className="flex items-center justify-center h-40">
    <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => PageLayout ?
  <PageLayout currentPageName={currentPageName}>{children}</PageLayout>
  : <>{children}</>;

const pageVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.18, ease: "easeInOut" }}
        className="flex-1 flex flex-col min-h-0"
      >
        <Suspense fallback={<PageFallback />}>
          <Routes location={location}>
            <Route path="/" element={
              <LayoutWrapper currentPageName={mainPageKey}>
                <MainPage />
              </LayoutWrapper>
            } />
            {Object.entries(Pages).map(([path, Page]) => (
              <Route
                key={path}
                path={`/${path}`}
                element={
                  <LayoutWrapper currentPageName={path}>
                    <Page />
                  </LayoutWrapper>
                }
              />
            ))}
            <Route path="/IntuneStarterKit" element={<LayoutWrapper currentPageName="IntuneStarterKit"><IntuneStarterKit /></LayoutWrapper>} />
            <Route path="/IntuneAdiMigration" element={<LayoutWrapper currentPageName="IntuneAdiMigration"><IntuneAdiMigration /></LayoutWrapper>} />
            <Route path="/AppHealthCheck" element={<LayoutWrapper currentPageName="AppHealthCheck"><AppHealthCheck /></LayoutWrapper>} />
            <Route path="/AdUserMigration" element={<LayoutWrapper currentPageName="AdUserMigration"><AdUserMigration /></LayoutWrapper>} />
            <Route path="/IntuneAssistant" element={<LayoutWrapper currentPageName="IntuneAssistant"><IntuneAssistant /></LayoutWrapper>} />
            <Route path="/register" element={<ClientRegister />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return <AnimatedRoutes />;
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <LicenseGate>
            <AuthenticatedApp />
          </LicenseGate>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App