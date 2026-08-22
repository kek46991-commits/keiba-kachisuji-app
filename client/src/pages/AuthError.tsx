import { useLocation } from "wouter";
import { startLogin } from "@/const";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, { title: string; description: string; canRetry: boolean }> = {
  missing_params: {
    title: "認証パラメータが不足しています",
    description: "ログインリクエストに必要な情報が含まれていませんでした。もう一度お試しください。",
    canRetry: true,
  },
  csrf_mismatch: {
    title: "セキュリティ検証に失敗しました",
    description: "ログインセッションの整合性が確認できませんでした。ブラウザのCookieを有効にして、もう一度お試しください。",
    canRetry: true,
  },
  no_openid: {
    title: "ユーザー情報の取得に失敗しました",
    description: "認証プロバイダからユーザー情報を取得できませんでした。しばらく時間をおいてから再度お試しください。",
    canRetry: true,
  },
  server_error: {
    title: "サーバーエラーが発生しました",
    description: "ログイン処理中にエラーが発生しました。しばらく時間をおいてから再度お試しください。",
    canRetry: true,
  },
};

const DEFAULT_ERROR = {
  title: "ログインに失敗しました",
  description: "予期しないエラーが発生しました。もう一度お試しください。",
  canRetry: true,
};

export default function AuthError() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") || "unknown";
  const errorInfo = ERROR_MESSAGES[reason] || DEFAULT_ERROR;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-400" />
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-white">{errorInfo.title}</h1>
          <p className="text-slate-400 leading-relaxed">{errorInfo.description}</p>
        </div>

        {/* Error Code */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 inline-block">
          <span className="text-xs text-slate-500 font-mono">エラーコード: {reason}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          {errorInfo.canRetry && (
            <Button
              onClick={() => startLogin()}
              className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              もう一度ログインする
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/")}
            className="border-slate-600 text-slate-300 hover:bg-slate-800 gap-2"
          >
            <Home className="w-4 h-4" />
            ホームに戻る
          </Button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-slate-500 pt-4">
          問題が解決しない場合は、ブラウザのキャッシュとCookieをクリアしてからお試しください。
        </p>
      </div>
    </div>
  );
}
