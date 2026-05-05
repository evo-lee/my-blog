import { Routes, Route } from 'react-router';
import { ThemeProvider } from '@/hooks/useTheme';
import { I18nProvider } from '@/i18n/useI18n';
import { AdminProvider } from '@/hooks/useAdmin';
import { usePageTracking } from '@/hooks/usePageTracking';
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

function AppContent() {
  usePageTracking();
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/articles" element={<Articles />} />
          <Route path="/article/:id" element={<ArticleDetail />} />
          <Route path="/works" element={<Works />} />
          <Route path="/works/:id" element={<WorkDetail />} />
          <Route path="/about" element={<About />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/setup" element={<AdminSetup />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/new" element={<AdminNewPost />} />
          <Route path="/admin/edit/:id" element={<AdminEditPost />} />
        </Routes>
      </main>
      <Footer />
    </>
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
