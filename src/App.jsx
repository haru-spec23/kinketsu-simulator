import { useEffect, useMemo, useState } from "react";
import { defaultState, loadState, saveState } from "./storage.js";

function yen(n) {
  return new Intl.NumberFormat("ja-JP").format(Math.round(n)) + "円";
}

function clampMonthStartDay(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(n)));
}

export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());

  // 保存
  useEffect(() => {
    saveState(state);
  }, [state]);

  const monthStartDay = state.settings.monthStartDay;

  // まだ計算は未実装なので0円のまま
  const totalThisMonth = useMemo(() => 0, [state]);

  return (
    <main
      style={{
        fontFamily: "system-ui",
        padding: 16,
        maxWidth: 900,
        margin: "0 auto",
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>金欠or貯金シミュレーター</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.8 }}>
          月の開始日（集計区切り）：{monthStartDay}日
        </p>
      </header>

      <section style={cardStyle()}>
        <h2 style={{ margin: "0 0 8px" }}>今月の合計</h2>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{yen(totalThisMonth)}</div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled style={btnStyle()}>
            ＋ 支出を追加（次で実装）
          </button>
        </div>
      </section>

      <section style={cardStyle()}>
        <h2 style={{ margin: "0 0 8px" }}>設定（保存テスト）</h2>
        <label style={{ display: "block", marginBottom: 8 }}>
          月の開始日（1〜28）：
          <select
            value={monthStartDay}
            onChange={(e) => {
              const next = clampMonthStartDay(e.target.value);
              setState((s) => ({
                ...s,
                settings: { ...s.settings, monthStartDay: next },
              }));
            }}
            style={{ marginLeft: 8, padding: 6, borderRadius: 8 }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}日
              </option>
            ))}
          </select>
        </label>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          ※ この設定は localStorage に保存されます（ページ更新しても残ればOK）
        </div>
      </section>

      <section style={cardStyle()}>
        <h2 style={{ margin: "0 0 8px" }}>ステータス</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>✅ GitHub Pages 公開</li>
          <li>✅ localStorage（settings / items）保存の土台</li>
          <li>🔜 アイテム追加フォーム</li>
          <li>🔜 集計ロジック（開始日で区切る）</li>
        </ul>
      </section>

      <footer style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        © {new Date().getFullYear()} kinketsu-simulator
      </footer>
    </main>
  );
}

function cardStyle() {
  return {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  };
}

function btnStyle() {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    cursor: "not-allowed",
    opacity: 0.6,
    background: "white",
    fontWeight: 600,
  };
}
