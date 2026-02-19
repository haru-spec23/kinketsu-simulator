function yen(n) {
  return new Intl.NumberFormat("ja-JP").format(n) + "円";
}

export default function App() {
  const totalThisMonth = 0;

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
          月の開始日は設定で変更できます（例：25日始まりなど）
        </p>
      </header>

      <section
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <h2 style={{ margin: "0 0 8px" }}>今月の合計</h2>
        <div style={{ fontSize: 32, fontWeight: 700 }}>{yen(totalThisMonth)}</div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled style={btnStyle()}>
            ＋ 支出を追加（次で実装）
          </button>
          <button type="button" disabled style={btnStyle("ghost")}>
            設定（次で実装）
          </button>
        </div>
      </section>

      <section
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ margin: "0 0 8px" }}>ステータス</h2>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>✅ GitHub Pages 公開</li>
          <li>🔜 localStorage 保存</li>
          <li>🔜 アイテム追加フォーム</li>
          <li>🔜 月開始日（1〜28）設定</li>
        </ul>
      </section>

      <footer style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        © {new Date().getFullYear()} kinketsu-simulator
      </footer>
    </main>
  );
}

function btnStyle(kind = "solid") {
  const base = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    cursor: "not-allowed",
    opacity: 0.6,
    background: "white",
  };
  if (kind === "ghost") return base;
  return { ...base, fontWeight: 600 };
}
