import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { XCircle } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function SubscriptionCancel() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen" style={{ background: "#0A1128" }}>
      <Navbar />
      <div className="flex items-center justify-center min-h-[80vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center px-6"
        >
          <XCircle className="w-16 h-16 mx-auto mb-4" style={{ color: "#EF4444" }} />
          <h1 className="text-2xl font-bold mb-2" style={{ color: "#ccd6f6" }}>
            登録をキャンセルしました
          </h1>
          <p className="text-sm mb-4" style={{ color: "#8899bb" }}>
            いつでもプレミアムプランに登録できます。
          </p>
          <button
            onClick={() => setLocation("/")}
            className="mt-4 px-6 py-2 rounded-lg text-sm font-medium"
            style={{ background: "#00E5FF22", color: "#00E5FF", border: "1px solid #00E5FF44" }}
          >
            ホームへ戻る
          </button>
        </motion.div>
      </div>
    </div>
  );
}
