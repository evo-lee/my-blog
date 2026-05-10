import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router';
import { trpc } from '@/providers/trpc';
import { useAdmin } from '@/hooks/useAdmin';
import { SEO } from '@/components/SEO';
import { getArticleWordCount } from '@/utils/wordCount';
import { ArrowLeft, Plus, Minus, Save, Loader2 } from 'lucide-react';

export default function AdminEditPost() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAdmin();

  const postId = Number(id);

  // Load existing post by id (no list pagination dance)
  const { data: existingPost, isLoading: isLoadingPost } = trpc.post.adminById.useQuery(
    { id: postId },
    { enabled: isAdmin && !isNaN(postId) }
  );

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [category, setCategory] = useState('LITERATURE');
  const [excerpt, setExcerpt] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [publishedDate, setPublishedDate] = useState('');
  const [published, setPublished] = useState(true);
  const [paragraphs, setParagraphs] = useState(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form when post loads
  useEffect(() => {
    if (existingPost) {
      setTitle(existingPost.title);
      setSlug(existingPost.slug);
      setCategory(existingPost.category);
      setExcerpt(existingPost.excerpt || '');
      setCoverImage(existingPost.coverImage || '');
      setPublishedDate(existingPost.publishedDate || '');
      setPublished(existingPost.published ?? true);
      try {
        const parsed = JSON.parse(existingPost.content || '[]');
        setParagraphs(Array.isArray(parsed) && parsed.length > 0 ? parsed : ['']);
      } catch {
        setParagraphs(['']);
      }
    }
  }, [existingPost]);

  const updateMutation = trpc.post.update.useMutation({
    onSuccess: () => {
      navigate('/admin');
    },
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">Please login first</p>
      </div>
    );
  }

  if (isLoadingPost) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-nocturne-gold" />
      </div>
    );
  }

  if (!existingPost) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-sm text-muted-foreground">Post not found</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !slug.trim()) return;

    setIsSubmitting(true);
    const content = paragraphs.filter((p) => p.trim());
    const wordCount = getArticleWordCount(content);

    updateMutation.mutate({
      id: postId,
      slug: slug.trim(),
      title: title.trim(),
      excerpt: excerpt.trim() || undefined,
      content,
      category: category.trim(),
      coverImage: coverImage.trim() || undefined,
      publishedDate: publishedDate.trim() || undefined,
      wordCount,
      published,
    });
  };

  const addParagraph = () => setParagraphs((prev) => [...prev, '']);
  const removeParagraph = (index: number) => {
    setParagraphs((prev) => prev.filter((_, i) => i !== index));
  };
  const updateParagraph = (index: number, value: string) => {
    setParagraphs((prev) => prev.map((p, i) => (i === index ? value : p)));
  };

  return (
    <>
      <SEO title={`Edit: ${title || 'Article'}`} description="Edit blog post" />
      <div className="min-h-screen pt-28 pb-24">
        <div className="max-w-[700px] mx-auto px-6 md:px-10">
          {/* Header */}
          <Link
            to="/admin"
            className="inline-flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Dashboard
          </Link>

          <h1 className="font-display text-3xl text-foreground tracking-tight mb-10">
            Edit Post
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Title *
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-display text-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="Article title"
                required
              />
            </div>

            {/* Slug */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Slug *
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">/article/</span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="flex-1 px-4 py-3 bg-card border border-border rounded-sm font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                  placeholder="article-slug"
                  required
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-mono text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
              >
                <option value="LITERATURE">LITERATURE</option>
                <option value="DESIGN">DESIGN</option>
                <option value="REFLECTION">REFLECTION</option>
                <option value="TECHNOLOGY">TECHNOLOGY</option>
              </select>
            </div>

            {/* Excerpt */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Excerpt
              </label>
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="Short summary of the article"
              />
            </div>

            {/* Cover Image */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Cover Image
              </label>
              <input
                value={coverImage}
                onChange={(e) => setCoverImage(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="/images/post-cover.jpg"
              />
            </div>

            {/* Published Date */}
            <div>
              <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground mb-2">
                Published Date
              </label>
              <input
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
                className="w-full px-4 py-3 bg-card border border-border rounded-sm font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                placeholder="2026.05.05"
              />
            </div>

            {/* Published Toggle */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="published"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="w-4 h-4 accent-nocturne-gold"
              />
              <label htmlFor="published" className="font-mono text-xs text-foreground">
                Published (visible on site)
              </label>
            </div>

            {/* Content Paragraphs */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
                  Content Paragraphs *
                </label>
                <button
                  type="button"
                  onClick={addParagraph}
                  className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Paragraph
                </button>
              </div>
              <div className="space-y-3">
                {paragraphs.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <textarea
                      value={p}
                      onChange={(e) => updateParagraph(i, e.target.value)}
                      rows={5}
                      className="flex-1 px-4 py-3 bg-card border border-border rounded-sm font-body text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-nocturne-gold/50"
                      placeholder={`Paragraph ${i + 1}`}
                    />
                    {paragraphs.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeParagraph(i)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center gap-4 pt-4">
              <button
                type="submit"
                disabled={isSubmitting || updateMutation.isPending}
                className="flex-1 py-3 bg-foreground text-background font-mono text-sm font-medium rounded-sm hover:bg-foreground/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
              <Link
                to="/admin"
                className="px-6 py-3 border border-border rounded-sm font-mono text-sm text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
