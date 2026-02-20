import { useEffect, useMemo, useState } from "react";
import { defaultState, loadState, saveState } from "./storage.js";
import { calcTotalThisPeriod, getMonthPeriod, dateFromISO, isWithin } from "./calc.js";
import { calcYearByMonth } from "./yearView.js";

// --- ヘルパー関数 ---
function yen(n) {
  return new Intl.NumberFormat("ja-JP").format(Math.round(n)) + "円";
}

function clampMonthStartDay(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(n)));
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function kind(it) {
  return it?.type === "income" ? "income" : "expense";
}

function categoryLabel(cat) {
  const labels = {
    fixed: "固定費", subscription: "サブスク", variable: "変動費",
    initial: "初期費用", other: "その他", salary: "給料",
    bonus: "単発収入", other_income: "その他収入",
  };
  return labels[cat] ?? cat;
}

function cycleLabel(cycle) {
  const labels = { monthly: "月額", yearly: "年額", one_time: "単発" };
  return labels[cycle] ?? cycle;
}

function dayLabel(it) {
  const k = kind(it);
  const word = k === "income" ? "入金" : "引落";
  if (it.cycle === "one_time") return it.payDate ? `${word}日: ${it.payDate}` : `${word}日: -`;
  const d = it.payDay ?? 1;
  return it.cycle === "monthly" ? `${word}: 毎月${d}日` : `${word}: 毎年${d}日`;
}

function sortKeyTime(it) {
  if (it.cycle === "one_time") return it.payDate ? new Date(it.payDate).getTime() : Infinity;
  const d = it.payDay ?? 1;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), d).getTime();
}

function buildThisPeriodEvents(items, settings, now = new Date()) {
  const { start, endExclusive } = getMonthPeriod(now, settings.monthStartDay);
  const events = [];
  for (const it of items) {
    if (!it || typeof it.amount !== "number") continue;
    const k = kind(it);
    const sign = k === "income" ? 1 : -1;
    if (it.cycle === "one_time") {
      if (!it.payDate) continue;
      const d = dateFromISO(it.payDate);
      if (isWithin(d, start, endExclusive)) {
        events.push({ date: d, id: it.id, name: it.name, signedAmount: sign * it.amount, type: k });
      }
    } else {
      const a = start;
      const b = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);
      const candidates = [
        new Date(a.getFullYear(), a.getMonth(), it.payDay ?? 1),
        new Date(b.getFullYear(), b.getMonth(), it.payDay ?? 1),
      ];
      const payDate = candidates.find((d) => isWithin(d, start, endExclusive));
      if (payDate) events.push({ date: payDate, id: it.id, name: it.name, signedAmount: sign * it.amount, type: k });
    }
  }
  return events.sort((x, y) => x.date.getTime() - y.date.getTime());
}

// --- メインコンポーネント ---
export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState("dateAsc");
  const [editing, setEditing] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [initialBalance, setInitialBalance] = useState(() => Number(localStorage.getItem("initialBalance") ?? 0));

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { localStorage.setItem("initialBalance", String(initialBalance)); }, [initialBalance]);

  // データ計算
  const expenseItems = useMemo(() => state.items.filter(x => kind(x) === "expense"), [state.items]);
  const incomeItems = useMemo(() => state.items.filter(x => kind(x) === "income"), [state.items]);
  const expenseThisMonth = useMemo(() => calcTotalThisPeriod(expenseItems, state.settings, new Date()), [expenseItems, state.settings]);
  const incomeThisMonth = useMemo(() => calcTotalThisPeriod(incomeItems, state.settings, new Date()), [incomeItems, state.settings]);
  const netThisMonth = incomeThisMonth - expenseThisMonth;

  const year = new Date().getFullYear();
  const expenseByMonth = useMemo(() => calcYearByMonth(expenseItems, year, state.settings.yearlyMode), [expenseItems, year, state.settings.yearlyMode]);
  const incomeByMonth = useMemo(() => calcYearByMonth(incomeItems, year, state.settings.yearlyMode), [incomeItems, year, state.settings.yearlyMode]);
  const netByMonth = expenseByMonth.map((v, i) => incomeByMonth[i] - v);

  const sortedItems = useMemo(() => {
    let arr = [...state.items];
    if (filterMode === "expense") arr = arr.filter(x => kind(x) === "expense");
    if (filterMode === "income") arr = arr.filter(x => kind(x) === "income");
    return arr.sort((a, b) => sortMode === "dateAsc" ? sortKeyTime(a) - sortKeyTime(b) : sortKeyTime(b) - sortKeyTime(a));
  }, [state.items, sortMode, filterMode]);

  const { start, endExclusive } = getMonthPeriod(new Date(), state.settings.monthStartDay);
  const endInclusive = new Date(new Date(endExclusive).setDate(endExclusive.getDate() - 1));
  const fmtJP = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  const periodLabel = `${start.getMonth() + 1}月（${fmtJP(start)}～${fmtJP(endInclusive)}）`;

  // 残高シミュレーション
  const thisEvents = useMemo(() => buildThisPeriodEvents(state.items, state.settings, new Date()), [state.items, state.settings]);
  const running = useMemo(() => {
    let bal = initialBalance;
    let firstNegative = null;
    let minBalance = initialBalance;
    const rows = thisEvents.map((ev) => {
      bal += ev.signedAmount;
      if (bal < minBalance) minBalance = bal;
      if (firstNegative == null && bal < 0) firstNegative = ev.date;
      return { ...ev, balance: bal };
    });
    return { rows, firstNegative, minBalance };
  }, [thisEvents, initialBalance]);

  // 保存・読込機能
  const handleExport = () => {
    const data = JSON.stringify({ state, initialBalance }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `money-sim-${todayISO()}.json`;
    a.click();
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed.state) setState(parsed.state);
        if (parsed.initialBalance !== undefined) setInitialBalance(parsed.initialBalance);
        alert("読み込みが完了しました");
      } catch (err) { alert("ファイルの形式が正しくありません"); }
    };
    reader.readAsText(file);
  };

  return (
    <main className="container">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>金欠or貯金シミュレーター</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.8 }}>月の開始日：{state.settings.monthStartDay}日</p>
      </header>

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>{periodLabel}（収支）</h2>
        <div style={{ marginBottom: 10 }}>
          <label>今月開始時の残高：
            <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} style={{ marginLeft: 8, padding: 6, borderRadius: 8, width: 120 }} /> 円
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <MiniStat label="支出合計" value={yen(expenseThisMonth)} />
          <MiniStat label="収入合計" value={yen(incomeThisMonth)} />
          <MiniStat label="差し引き" value={yen(netThisMonth)} color={netThisMonth >= 0 ? "#4ade80" : "#f87171"} />
        </div>
        {running.firstNegative && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid #f87171", background: "rgba(248,113,113,0.1)" }}>
            ⚠️ {fmtJP(running.firstNegative)} に残高がマイナスになります
          </div>
        )}
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btnPrimary" onClick={() => setShowAdd(true)}>＋ 追加</button>
          <button className="btn btnDanger" onClick={() => confirm("リセットしますか？") && setState(defaultState())}>リセット</button>
        </div>
      </section>

      {/* グラフエリア */}
      <section className="card">
        <h2 style={{ margin: "0 0 12px" }}>残高推移（今月）</h2>
        {running.rows.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: 12, textAlign: "center", padding: "20px 0" }}>データがありません</div>
        ) : (
          <LineChart rows={running.rows} initialBalance={initialBalance} />
        )}
      </section>

      {/* モーダル、一覧、年間セクションは既存のまま（省略せず統合） */}
      {(showAdd || editing) && (
        <div className="modalOverlay" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing ? "編集" : "追加"}</h2>
              <button className="btn btnSmall" onClick={() => { setShowAdd(false); setEditing(null); }}>閉じる</button>
            </div>
            <AddForm initialItem={editing} onCancel={() => { setShowAdd(false); setEditing(null); }} onSave={(item) => {
              setState(s => ({ ...s, items: editing ? s.items.map(x => x.id === item.id ? item : x) : [item, ...s.items] }));
              setShowAdd(false); setEditing(null);
            }} />
          </div>
        </div>
      )}

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>一覧</h2>
        <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
          <select value={filterMode} onChange={e => setFilterMode(e.target.value)} className="select">
            <option value="all">すべて</option><option value="expense">支出のみ</option><option value="income">収入のみ</option>
          </select>
          <select value={sortMode} onChange={e => setSortMode(e.target.value)} className="select">
            <option value="dateAsc">日付順（早）</option><option value="dateDesc">日付順（遅）</option>
          </select>
        </div>
        <table className="table">
          <thead><tr><th>項目</th><th>金額</th><th>日付</th><th></th></tr></thead>
          <tbody>
            {sortedItems.map(it => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td style={{ color: kind(it) === "income" ? "#4ade80" : "#f87171" }}>{yen(it.amount)}</td>
                <td>{dayLabel(it)}</td>
                <td>
                  <button className="btn btnSmall" onClick={() => setEditing(it)}>編集</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>データバックアップ</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={handleExport}>JSONとして保存</button>
          <label className="btn" style={{ cursor: "pointer" }}>
            ファイルを読み込む
            <input type="file" accept=".json" onChange={handleImport} style={{ display: "none" }} />
          </label>
        </div>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>※ 機種変更やブラウザ清掃時のバックアップにご利用ください。</p>
      </section>
      
      <footer className="footer">© {new Date().getFullYear()} kinketsu-simulator</footer>
    </main>
  );
}

// --- グラフコンポーネント (修正版) ---
function LineChart({ rows, initialBalance }) {
  const width = 640;
  const height = 180;
  const pad = 30;

  // グラフ用の全ポイント（開始点を含む）
  const dataPoints = [{ balance: initialBalance, date: null }, ...rows];
  const balances = dataPoints.map(d => d.balance);
  const max = Math.max(...balances, 1);
  const min = Math.min(...balances, 0);
  const range = max - min || 1;

  const getX = (i) => pad + (i * (width - pad * 2)) / (dataPoints.length - 1);
  const getY = (val) => pad + (1 - (val - min) / range) * (height - pad * 2);

  const pointsString = dataPoints.map((d, i) => `${getX(i)},${getY(d.balance)}`).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto", background: "rgba(255,255,255,0.02)", borderRadius: 12 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 400, height: 200 }}>
        {/* 基準線 */}
        <line x1={pad} y1={getY(0)} x2={width - pad} y2={getY(0)} stroke="rgba(255,255,255,0.1)" strokeDasharray="4" />
        {/* メインの折れ線 */}
        <polyline points={pointsString} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" />
        {/* 各プロット点 */}
        {dataPoints.map((d, i) => (
          <g key={i}>
            <circle cx={getX(i)} cy={getY(d.balance)} r="4" fill={d.balance < 0 ? "#f87171" : "#3b82f6"} />
            {d.date && (i === 1 || i === dataPoints.length - 1 || i % 3 === 0) && (
              <text x={getX(i)} y={height - 5} fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="middle">
                {d.date.getDate()}日
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

// --- フォーム (簡易化して統合) ---
function AddForm({ onSave, onCancel, initialItem }) {
  const [f, setF] = useState(initialItem ?? { type: "expense", name: "", amount: "", cycle: "monthly", category: "fixed", payDay: "1", payDate: todayISO() });
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <select value={f.type} onChange={e => setF({...f, type: e.target.value})} className="select">
        <option value="expense">支出</option><option value="income">収入</option>
      </select>
      <input placeholder="項目名" value={f.name} onChange={e => setF({...f, name: e.target.value})} className="input" />
      <input placeholder="金額" type="number" value={f.amount} onChange={e => setF({...f, amount: e.target.value})} className="input" />
      <select value={f.cycle} onChange={e => setF({...f, cycle: e.target.value})} className="select">
        <option value="monthly">毎月</option><option value="one_time">単発</option>
      </select>
      {f.cycle === "one_time" ? 
        <input type="date" value={f.payDate} onChange={e => setF({...f, payDate: e.target.value})} className="input" /> :
        <input placeholder="日 (1-28)" type="number" value={f.payDay} onChange={e => setF({...f, payDay: e.target.value})} className="input" />
      }
      <button className="btn btnPrimary" onClick={() => onSave({...f, amount: Number(f.amount), id: f.id ?? uid()})}>保存</button>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: "bold", color }}>{value}</div>
    </div>
  );
}
