import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { motion } from "framer-motion";
import { Key, Lock, ShieldCheck, Ticket } from "lucide-react";
import Navbar from "@/components/Navbar";
import PageHead from "@/components/PageHead";
import { trpc } from "@/lib/trpc";
import { useSubscription } from "@/contexts/SubscriptionContext";

/**
 * 期限付きアクセスパスの購入・キー入力ページ。
 * アカウント登録なしでも、決済完了後に発行されるキーで有料コンテンツを解放できる。
 */
export default function AccessPassPage() {
  const searchString = useSearch();
  const params = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const sessionId = params.get("session_id");
  const from = params.get("from");
  const canceled = params.get("canceled") === "1";

  const utils = trpc.useUtils();
  const { isPremium, accessSource, accessExpiresAt } = useSubscription();
  const { data: plans } = trpc.accessPass.getPlans.useQuery();

  const [issuedKey, setIssuedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [message, setMessage] = useState<string | null>(canceled ? "決済がキャンセルされました。" : null);

  const checkout = trpc.accessPass.createCheckout.useMutation({
    onSuccess: result => {
      if (result.url) window.location.href = result.url;
    },
    onError: error => setMessage(error.message),
  });

  const claim = trpc.accessPass.claim.useMutation({
    onSuccess: async result => {
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setIssuedKey(result.key);
      setMessage(null);
      await utils.accessPass.getAccess.invalidate();
    },
    onError: error => setMessage(error.message),
  });

  const redeem = trpc.accessPass.redeem.useMutation({
    onSuccess: async result => {
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setMessage(null);
      // Cookieを含めて全クエリを取り直すため、遷移はフルリロードで行う
      window.location.assign(from && from.startsWith("/") ? from : "/todays-predictions");
    },
    onError: error => setMessage(error.message),
  });

  useEffect(() => {
    if (sessionId) claim.mutate({ sessionId });
    // 決済完了時に一度だけキーを受け取る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const expiresLabel = accessExpiresAt
    ? new Date(accessExpiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })
    : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A1128" }}>
      <PageHead
        title="アクセスパス購入"
        description="競馬でGO！の有料予想は、期限付きアクセスパスの購入またはプレミアムプランで解放できます。"
        path="/access-pass"
      />
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-2" style={{ color: "#00E5FF" }}>
            <Lock className="w-4 h-4" />
            <span className="text-xs font-bold tracking-widest">PREMIUM ACCESS</span>
          </div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#ffffff" }}>
            有料予想へのアクセス
          </h1>
          <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.66)" }}>
            AI予想・買い目・的中判定・回収率の詳細は有料コンテンツです。アカウント登録不要の期限付きアクセスパス、または月額プレミアムプランで解放できます。
          </p>

          {isPremium && (
            <div
              className="mb-8 rounded-xl p-4 flex items-start gap-3"
              style={{ backgroundColor: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.3)" }}
            >
              <ShieldCheck className="w-5 h-5 mt-0.5" style={{ color: "#00E5FF" }} />
              <div>
                <p className="text-sm font-bold" style={{ color: "#ffffff" }}>
                  現在アクセス可能です（{accessSource === "access_pass" ? "アクセスパス" : "プレミアムプラン"}）
                </p>
                {expiresLabel && (
                  <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
                    有効期限: {expiresLabel}
                  </p>
                )}
                <div className="flex gap-3 mt-3 text-xs">
                  <Link href="/todays-predictions" style={{ color: "#00E5FF" }}>
                    今日の予想を見る →
                  </Link>
                  <Link href="/dashboard" style={{ color: "#00E5FF" }}>
                    回収率ダッシュボード →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {issuedKey && (
            <div
              className="mb-8 rounded-xl p-4"
              style={{ backgroundColor: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.35)" }}
            >
              <p className="text-sm font-bold mb-2" style={{ color: "#e4c875" }}>
                アクセスキーを発行しました（必ず控えてください）
              </p>
              <code className="block text-lg tracking-widest mb-2" style={{ color: "#ffffff" }}>
                {issuedKey}
              </code>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
                このブラウザには自動で保存済みです。別の端末では下の入力欄にキーを入力してください。
              </p>
            </div>
          )}

          {message && (
            <div
              className="mb-6 rounded-lg p-3 text-sm"
              style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#fda4af" }}
            >
              {message}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {(plans ?? []).map(plan => (
              <div
                key={plan.plan}
                className="rounded-xl p-5"
                style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,255,0.2)" }}
              >
                <div className="flex items-center gap-2 mb-2" style={{ color: "#00E5FF" }}>
                  <Ticket className="w-4 h-4" />
                  <span className="text-sm font-bold">{plan.label}</span>
                </div>
                <p className="text-2xl font-bold mb-1" style={{ color: "#ffffff" }}>
                  ¥{plan.amount.toLocaleString()}
                </p>
                <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.6)" }}>
                  購入から{plan.days}日間、全ての予想・的中判定・回収率が閲覧できます（アカウント登録不要）。
                </p>
                <button
                  onClick={() => checkout.mutate({ plan: plan.plan })}
                  disabled={checkout.isPending}
                  className="w-full py-2.5 rounded-lg text-sm font-bold"
                  style={{ background: "#00E5FF", color: "#0A1128" }}
                >
                  {checkout.isPending ? "決済画面へ移動中..." : "購入して解放する"}
                </button>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl p-5 mb-8"
            style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-center gap-2 mb-3" style={{ color: "#ffffff" }}>
              <Key className="w-4 h-4" />
              <span className="text-sm font-bold">アクセスキーをお持ちの方</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={keyInput}
                onChange={event => setKeyInput(event.target.value)}
                placeholder="KG-XXXXX-XXXXX-XXXXX-XXXXX"
                className="flex-1 px-3 py-2.5 rounded-lg text-sm"
                style={{ backgroundColor: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.15)", color: "#ffffff" }}
              />
              <button
                onClick={() => redeem.mutate({ key: keyInput })}
                disabled={redeem.isPending || keyInput.trim() === ""}
                className="px-5 py-2.5 rounded-lg text-sm font-bold"
                style={{ background: "rgba(0,229,255,0.15)", border: "1px solid rgba(0,229,255,0.4)", color: "#00E5FF" }}
              >
                {redeem.isPending ? "確認中..." : "キーで解放"}
              </button>
            </div>
          </div>

          <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            月額プレミアムプラン（初回10日間無料）をご希望の方は{" "}
            <Link href="/pricing" style={{ color: "#00E5FF" }}>
              料金プラン
            </Link>{" "}
            からご登録ください。
          </p>
        </motion.div>
      </div>
    </div>
  );
}
