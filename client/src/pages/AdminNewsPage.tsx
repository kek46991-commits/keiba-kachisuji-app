import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import Navbar from "@/components/Navbar";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

type NewsCategory = "breaking" | "result" | "column" | "prediction";

interface NewsFormData {
  title: string;
  thumbnailUrl: string;
  summary: string;
  linkUrl: string;
  category: NewsCategory;
  isPickup: boolean;
}

const emptyForm: NewsFormData = {
  title: "",
  thumbnailUrl: "",
  summary: "",
  linkUrl: "",
  category: "breaking",
  isPickup: false,
};

const categoryLabels: Record<NewsCategory, string> = {
  breaking: "速報",
  result: "結果",
  column: "コラム",
  prediction: "予想",
};

const categoryColors: Record<NewsCategory, string> = {
  breaking: "#ef4444",
  result: "#22c55e",
  column: "#3b82f6",
  prediction: "#f59e0b",
};

export default function AdminNewsPage() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState<NewsFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const utils = trpc.useUtils();
  const isAdmin = user?.role === "admin";
  const { data: newsList, isLoading } = trpc.news.list.useQuery(undefined, {
    enabled: isAdmin,
  });

  const createMutation = trpc.news.create.useMutation({
    onSuccess: () => {
      toast.success("ニュースを追加しました");
      utils.news.list.invalidate();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.news.update.useMutation({
    onSuccess: () => {
      toast.success("ニュースを更新しました");
      utils.news.list.invalidate();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.news.delete.useMutation({
    onSuccess: () => {
      toast.success("ニュースを削除しました");
      utils.news.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const togglePickupMutation = trpc.news.togglePickup.useMutation({
    onSuccess: () => {
      utils.news.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleActiveMutation = trpc.news.toggleActive.useMutation({
    onSuccess: () => {
      utils.news.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // 認証チェック
  if (authLoading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <p style={{ color: "#94a3b8" }}>認証確認中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-lg" style={{ color: "#e2e8f0" }}>ログインが必要です</p>
          <button
            onClick={() => startLogin()}
            className="px-6 py-2 rounded-lg font-bold text-sm"
            style={{
              backgroundColor: "rgba(0,229,255,0.15)",
              border: "1px solid rgba(0,229,255,0.4)",
              color: "#00e5ff",
            }}
          >
            ログイン
          </button>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
        <Navbar />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-lg" style={{ color: "#ef4444" }}>アクセス権限がありません</p>
          <p className="text-sm" style={{ color: "#94a3b8" }}>このページは管理者専用です。</p>
        </div>
      </div>
    );
  }

  function resetForm() {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function handleEdit(item: NonNullable<typeof newsList>[number]) {
    setFormData({
      title: item.title,
      thumbnailUrl: item.thumbnailUrl || "",
      summary: item.summary || "",
      linkUrl: item.linkUrl || "",
      category: item.category as NewsCategory,
      isPickup: item.isPickup ?? false,
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }

    if (editingId !== null) {
      updateMutation.mutate({
        id: editingId,
        title: formData.title,
        thumbnailUrl: formData.thumbnailUrl || null,
        summary: formData.summary || null,
        linkUrl: formData.linkUrl || null,
        category: formData.category,
        isPickup: formData.isPickup,
      });
    } else {
      createMutation.mutate({
        title: formData.title,
        thumbnailUrl: formData.thumbnailUrl || undefined,
        summary: formData.summary || undefined,
        linkUrl: formData.linkUrl || undefined,
        category: formData.category,
        isPickup: formData.isPickup,
      });
    }
  }

  function handleDelete(id: number) {
    if (window.confirm("このニュースを削除しますか？")) {
      deleteMutation.mutate({ id });
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ color: "#ffffff", fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              ニュース管理
            </h1>
            <p className="text-sm mt-1" style={{ color: "#94a3b8" }}>
              ピックアップニュースの追加・編集・削除
            </p>
          </div>
          <button
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                setShowForm(true);
              }
            }}
            className="px-4 py-2 rounded-lg font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: showForm ? "rgba(239,68,68,0.2)" : "rgba(0,229,255,0.15)",
              border: showForm ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(0,229,255,0.4)",
              color: showForm ? "#ef4444" : "#00e5ff",
            }}
          >
            {showForm ? "✕ キャンセル" : "＋ 新規追加"}
          </button>
        </div>

        {/* 追加/編集フォーム */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden mb-8"
            >
              <form
                onSubmit={handleSubmit}
                className="p-6 rounded-xl"
                style={{
                  backgroundColor: "rgba(13,26,58,0.8)",
                  border: "1px solid rgba(201,168,76,0.2)",
                }}
              >
                <h2
                  className="text-lg font-bold mb-4"
                  style={{ color: "#e2e8f0" }}
                >
                  {editingId ? "ニュースを編集" : "新しいニュースを追加"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* タイトル */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      タイトル *
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      placeholder="ニュースのタイトルを入力"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(100,116,139,0.3)",
                        color: "#e2e8f0",
                      }}
                      required
                    />
                  </div>

                  {/* サムネイルURL */}
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      サムネイルURL
                    </label>
                    <input
                      type="url"
                      value={formData.thumbnailUrl}
                      onChange={(e) => setFormData({ ...formData, thumbnailUrl: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(100,116,139,0.3)",
                        color: "#e2e8f0",
                      }}
                    />
                  </div>

                  {/* リンクURL */}
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      リンクURL
                    </label>
                    <input
                      type="url"
                      value={formData.linkUrl}
                      onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                      placeholder="https://example.com/article"
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(100,116,139,0.3)",
                        color: "#e2e8f0",
                      }}
                    />
                  </div>

                  {/* カテゴリ */}
                  <div>
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      カテゴリ
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as NewsCategory })}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(100,116,139,0.3)",
                        color: "#e2e8f0",
                      }}
                    >
                      <option value="breaking">速報</option>
                      <option value="result">結果</option>
                      <option value="column">コラム</option>
                      <option value="prediction">予想</option>
                    </select>
                  </div>

                  {/* ピックアップ */}
                  <div className="flex items-center gap-3 pt-5">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPickup}
                        onChange={(e) => setFormData({ ...formData, isPickup: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:rounded-full after:h-4 after:w-4 after:transition-all"
                        style={{
                          backgroundColor: formData.isPickup ? "rgba(0,229,255,0.6)" : "rgba(100,116,139,0.3)",
                        }}
                      >
                        <div
                          className="absolute top-[2px] rounded-full h-4 w-4 transition-all"
                          style={{
                            backgroundColor: "#ffffff",
                            left: formData.isPickup ? "calc(100% - 18px)" : "2px",
                          }}
                        />
                      </div>
                    </label>
                    <span className="text-sm" style={{ color: "#e2e8f0" }}>
                      ピックアップに表示
                    </span>
                  </div>

                  {/* 概要 */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      概要
                    </label>
                    <textarea
                      value={formData.summary}
                      onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                      placeholder="ニュースの概要を入力（任意）"
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg text-sm resize-none"
                      style={{
                        backgroundColor: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(100,116,139,0.3)",
                        color: "#e2e8f0",
                      }}
                    />
                  </div>
                </div>

                {/* サムネイルプレビュー */}
                {formData.thumbnailUrl && (
                  <div className="mt-4">
                    <label className="block text-xs font-bold mb-1" style={{ color: "#94a3b8" }}>
                      プレビュー
                    </label>
                    <img
                      src={formData.thumbnailUrl}
                      alt="preview"
                      className="w-32 h-20 object-cover rounded-lg"
                      style={{ border: "1px solid rgba(100,116,139,0.3)" }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                {/* 送信ボタン */}
                <div className="mt-6 flex gap-3">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-6 py-2 rounded-lg font-bold text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    style={{
                      backgroundColor: "rgba(0,229,255,0.15)",
                      border: "1px solid rgba(0,229,255,0.4)",
                      color: "#00e5ff",
                    }}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "保存中..."
                      : editingId
                        ? "更新する"
                        : "追加する"}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg text-sm transition-all duration-200"
                    style={{ color: "#94a3b8" }}
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ニュース一覧 */}
        {isLoading ? (
          <div className="text-center py-12" style={{ color: "#94a3b8" }}>
            読み込み中...
          </div>
        ) : !newsList || newsList.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg" style={{ color: "#64748b" }}>
              ニュースがまだありません
            </p>
            <p className="text-sm mt-2" style={{ color: "#475569" }}>
              「＋ 新規追加」ボタンからニュースを追加してください
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {newsList.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
                style={{
                  backgroundColor: item.isActive ? "rgba(13,26,58,0.6)" : "rgba(13,26,58,0.3)",
                  border: item.isPickup
                    ? "1px solid rgba(201,168,76,0.4)"
                    : "1px solid rgba(100,116,139,0.15)",
                  opacity: item.isActive ? 1 : 0.5,
                }}
              >
                {/* サムネイル */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden" style={{ backgroundColor: "rgba(15,23,42,0.8)" }}>
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-lg" style={{ color: "#475569" }}>
                      📰
                    </div>
                  )}
                </div>

                {/* コンテンツ */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {/* カテゴリバッジ */}
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: `${categoryColors[item.category as NewsCategory]}20`,
                        color: categoryColors[item.category as NewsCategory],
                        border: `1px solid ${categoryColors[item.category as NewsCategory]}40`,
                      }}
                    >
                      {categoryLabels[item.category as NewsCategory]}
                    </span>
                    {item.isPickup && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "rgba(201,168,76,0.15)",
                          color: "#c9a84c",
                          border: "1px solid rgba(201,168,76,0.3)",
                        }}
                      >
                        PICKUP
                      </span>
                    )}
                    {!item.isActive && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "rgba(239,68,68,0.1)",
                          color: "#ef4444",
                        }}
                      >
                        非公開
                      </span>
                    )}
                  </div>
                  <h3
                    className="text-sm font-bold truncate"
                    style={{ color: "#e2e8f0" }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-xs truncate mt-0.5" style={{ color: "#64748b" }}>
                    {new Date(item.publishedAt).toLocaleString("ja-JP", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.summary && ` — ${item.summary}`}
                  </p>
                </div>

                {/* アクションボタン */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* ピックアップ切り替え */}
                  <button
                    onClick={() => togglePickupMutation.mutate({ id: item.id, isPickup: !item.isPickup })}
                    title={item.isPickup ? "ピックアップ解除" : "ピックアップに設定"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: item.isPickup ? "rgba(201,168,76,0.2)" : "rgba(100,116,139,0.1)",
                      border: item.isPickup ? "1px solid rgba(201,168,76,0.4)" : "1px solid rgba(100,116,139,0.2)",
                    }}
                  >
                    <span className="text-sm">{item.isPickup ? "⭐" : "☆"}</span>
                  </button>

                  {/* 有効/無効切り替え */}
                  <button
                    onClick={() => toggleActiveMutation.mutate({ id: item.id, isActive: !item.isActive })}
                    title={item.isActive ? "非公開にする" : "公開する"}
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: item.isActive ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.1)",
                      border: item.isActive ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(100,116,139,0.2)",
                    }}
                  >
                    <span className="text-sm">{item.isActive ? "👁" : "👁‍🗨"}</span>
                  </button>

                  {/* 編集 */}
                  <button
                    onClick={() => handleEdit(item)}
                    title="編集"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.3)",
                    }}
                  >
                    <span className="text-sm">✏️</span>
                  </button>

                  {/* 削除 */}
                  <button
                    onClick={() => handleDelete(item.id)}
                    title="削除"
                    className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                      backgroundColor: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                  >
                    <span className="text-sm">🗑</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 統計 */}
        {newsList && newsList.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="総数" value={newsList.length} color="#94a3b8" />
            <StatCard label="公開中" value={newsList.filter(n => n.isActive).length} color="#22c55e" />
            <StatCard label="ピックアップ" value={newsList.filter(n => n.isPickup).length} color="#c9a84c" />
            <StatCard label="非公開" value={newsList.filter(n => !n.isActive).length} color="#ef4444" />
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="p-3 rounded-lg text-center"
      style={{
        backgroundColor: "rgba(13,26,58,0.6)",
        border: `1px solid ${color}30`,
      }}
    >
      <div className="text-xl font-bold" style={{ color }}>{value}</div>
      <div className="text-[11px]" style={{ color: "#64748b" }}>{label}</div>
    </div>
  );
}
