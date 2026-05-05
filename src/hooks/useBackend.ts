import { trpc } from "@/providers/trpc";

// 文章列表（支持分页）
export function usePosts(page = 1, perPage = 6) {
  return trpc.post.list.useQuery({ page, perPage });
}

// 单篇文章（by slug）
export function usePostBySlug(slug: string) {
  return trpc.post.bySlug.useQuery({ slug }, { enabled: !!slug });
}

// 搜索文章
export function useSearchPosts(q: string) {
  return trpc.post.search.useQuery(
    { q },
    { enabled: q.trim().length > 0 }
  );
}

// 作品列表
export function useWorks() {
  return trpc.work.list.useQuery();
}

// 单个作品（by slug）
export function useWorkBySlug(slug: string) {
  return trpc.work.bySlug.useQuery({ slug }, { enabled: !!slug });
}
