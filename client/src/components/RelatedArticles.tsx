import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

const CATEGORY_LABELS: Record<string, string> = {
  prediction: "予想",
  analysis: "解析",
  course: "コース",
  horse: "馬",
  jockey: "騎手",
  news: "ニュース",
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default function RelatedArticles({
  slug,
  category,
}: {
  slug: string;
  category: string;
}) {
  const { data: relatedPosts, isLoading } = trpc.blog.getRelated.useQuery({
    slug,
    category: category as "prediction" | "analysis" | "course" | "horse" | "jockey" | "news",
    limit: 3,
  });
  const [, navigate] = useLocation();

  if (isLoading || !relatedPosts || relatedPosts.length === 0) return null;

  return (
    <div className="mt-10 pt-6" style={{ borderTop: "1px solid rgba(0,229,255,0.1)" }}>
      <div className="flex items-center gap-2 mb-4">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <h3 className="text-sm font-bold" style={{ color: "#e2e8f0" }}>
          関連記事
        </h3>
      </div>
      <div className="flex flex-col gap-3">
        {relatedPosts.map((related) => (
          <div
            key={related.id}
            className="p-4 cursor-pointer transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]"
            style={{
              backgroundColor: "rgba(0,229,255,0.03)",
              border: "1px solid rgba(0,229,255,0.1)",
              borderRadius: "6px",
            }}
            onClick={() => navigate(`/blog/${related.slug}`)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[10px] px-1.5 py-0.5"
                    style={{
                      backgroundColor: "rgba(0,229,255,0.1)",
                      color: "#00E5FF",
                      border: "1px solid rgba(0,229,255,0.2)",
                      borderRadius: "3px",
                    }}
                  >
                    {CATEGORY_LABELS[related.category] ?? related.category}
                  </span>
                  <span className="text-[10px]" style={{ color: "#64748b" }}>
                    {formatDate(related.createdAt)}
                  </span>
                </div>
                <h4
                  className="text-sm font-bold line-clamp-2 mb-1"
                  style={{ color: "#e2e8f0" }}
                >
                  {related.title}
                </h4>
                {related.summary && (
                  <p className="text-xs line-clamp-2" style={{ color: "#94a3b8" }}>
                    {related.summary}
                  </p>
                )}
              </div>
              <span className="text-xs mt-1 flex-shrink-0" style={{ color: "#00E5FF" }}>
                →
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
