import type { ReactNode } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router';
import { ThemeProvider } from '@/hooks/useTheme';
import { I18nProvider } from '@/i18n/useI18n';
import { AdminProvider } from '@/hooks/useAdmin';
import { usePageTracking } from '@/hooks/usePageTracking';
import { trpc } from '@/providers/trpc';
import { SEO } from '@/components/SEO';
import Header from '@/sections/Header';
import Hero from '@/sections/Hero';
import PostList from '@/sections/PostList';
import WorkList from '@/sections/WorkList';
import Footer from '@/sections/Footer';
import ArticleDetail from '@/pages/ArticleDetail';
import Articles from '@/pages/Articles';
import Works from '@/pages/Works';
import WorkDetail from '@/pages/WorkDetail';
import About from '@/pages/About';
import Admin from '@/pages/Admin';
import AdminSetup from '@/pages/AdminSetup';
import AdminLogin from '@/pages/AdminLogin';
import AdminEditPost from '@/pages/AdminEditPost';
import AdminNewPost from '@/pages/AdminNewPost';

function NotFound() {
  return (
    <>
      <SEO title="Not Found" description="The page you are looking for does not exist." url="/" />
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-4xl text-foreground mb-4">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/" className="font-mono text-sm text-foreground underline underline-offset-4">
          Return home
        </Link>
      </div>
    </>
  );
}

function Home() {
  return (
    <>
      <SEO
        title="Home"
        description="Thoughts on literature, design, and the quiet spaces in between. A personal blog by Evo Lee."
        keywords="blog, literature, design, writing, personal blog, Evo Lee"
        url="/"
      />
      <Hero />
      <PostList />
      <WorkList />
    </>
  );
}

function SetupGuard({ children }: { children: ReactNode }) {
  const { data: setupData, isLoading } = trpc.auth.isSetup.useQuery();
  if (isLoading) return null;
  if (setupData?.isSetup) return <AdminSetup />;
  return <>{children}</>;
}

function AppContent() {
  usePageTracking();
  return (
    <SetupGuard>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/en" element={<Navigate to="/" replace />} />
          <Route path="/zh-CN" element={<Navigate to="/" replace />} />
          <Route path="/zh" element={<Navigate to="/" replace />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/article/:id" element={<ArticleDetail />} />
          <Route path="/works" element={<Works />} />
          <Route path="/works/:id" element={<WorkDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/new" element={<AdminNewPost />} />
          <Route path="/admin/edit/:id" element={<AdminEditPost />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </SetupGuard>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <AdminProvider>
          <AppContent />
        </AdminProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
