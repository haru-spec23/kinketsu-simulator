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
  return (
    {
      fixed: "固定費",
      subscription: "サブスク",
      variable: "変動費",
      initial: "初期費用",
      other: "その他",
      salary: "給料",
      bonus: "単発収入",
      other_income: "その他収入",
    }[cat] ?? cat
  );
}

function cycleLabel(cycle) {
  return (
    {
      monthly: "月額",
      yearly: "年額",
      one_time: "単発",
    }[cycle] ?? cycle
  );
}

function dayLabel(it) {
  const k = kind(it);
  const word = k === "income" ? "入金" : "引落";
  if (it.cycle === "one_time") {
    return it.payDate ? `${word}日: ${it.payDate}` : `${word}日: -`;
  }
  const d = it.payDay ?? 1;
  if (it.cycle === "monthly") return `${word}: 毎月${d}日`;
  if (it.cycle === "yearly") return `${word}: 毎年${d}日`;
  return "-";
}

function sortKeyTime(it) {
  if (it.cycle === "one_time") {
    return it.payDate ? new Date(it.payDate).getTime() : Number.POSITIVE_INFINITY;
  }
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
    const sign = k === "income" ? +1 : -1;
    if (it.cycle === "one_time") {
      if (!it.payDate) continue;
      const d = dateFromISO(it.payDate);
      if (isWithin(d, start, endExclusive)) {
        events.push({ date: d, id: it.id, name: it.name, signedAmount: sign * it.amount, type: k });
      }
      continue;
    }
    const a = start;
    const b = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);
    const candidates = [
      new Date(a.getFullYear(), a.getMonth(), it.payDay ?? 1),
      new Date(b.getFullYear(), b.getMonth(), it.payDay ?? 1),
    ];
    const payDate = candidates.find((d) => isWithin(d, start, endExclusive));
    if (!payDate) continue;
    events.push({ date: payDate, id: it.id, name: it.name, signedAmount: sign * it.amount, type: k });
  }
  events.sort((x, y) => x.date.getTime() - y.date.getTime());
  return events;
}

// --- メインコンポーネント ---
export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState("dateAsc");
  const [editing, setEditing] = useState(null);
  const [filterMode, setFilterMode] = useState("all");
  const [initialBalance, setInitialBalance] = useState(() => {
    const v = localStorage.getItem("initialBalance");
    return v ? Number(v) : 0;
  });

  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { localStorage.setItem("initialBalance", String(initialBalance)); }, [initialBalance]);

  const expenseItems = useMemo(() => state.items.filter((x) => kind(x) === "expense"), [state.items]);
  const incomeItems = useMemo(() => state.items.filter((x) => kind(x) === "income"), [state.items]);

  const expenseThisMonth = useMemo(() => calcTotalThisPeriod(expenseItems, state.settings, new Date()), [expenseItems, state.settings]);
  const incomeThisMonth = useMemo(() => calcTotalThisPeriod(incomeItems, state.settings, new Date()), [incomeItems, state.settings]);
  const netThisMonth = useMemo(() => incomeThisMonth - expenseThisMonth, [incomeThisMonth, expenseThisMonth]);

  const year = new Date().getFullYear();
  const expenseByMonth = useMemo(() => calcYearByMonth(expenseItems, year, state.settings.yearlyMode), [expenseItems, year, state.settings.yearlyMode]);
  const incomeByMonth = useMemo(() => calcYearByMonth(incomeItems, year, state.settings.yearlyMode), [incomeItems, year, state.settings.yearlyMode]);
  const netByMonth = useMemo(() => expenseByMonth.map((v, i) => incomeByMonth[i] - v), [expenseByMonth, incomeByMonth]);
  const expenseYearTotal = useMemo(() => expenseByMonth.reduce((a, b) => a + b, 0), [expenseByMonth]);
  const incomeYearTotal = useMemo(() => incomeByMonth.reduce((a, b) => a + b, 0), [incomeByMonth]);
  const netYearTotal = useMemo(() => netByMonth.reduce((a, b) => a + b, 0), [netByMonth]);

  const sortedItems = useMemo(() => {
    let arr = [...state.items];
    if (filterMode === "expense") arr = arr.filter(x => kind(x) === "expense");
    if (filterMode === "income") arr = arr.filter(x => kind(x) === "income");
    arr.sort((a, b) => {
      const ka = sortKeyTime(a);
      const kb = sortKeyTime(b);
      return sortMode === "dateAsc" ? ka - kb : kb - ka;
    });
    return arr;
  }, [state.items, sortMode, filterMode]);

  const monthStartDay = state.settings.monthStartDay;
  const now = new Date();
  const { start, endExclusive } = useMemo(() => getMonthPeriod(now, monthStartDay), [now, monthStartDay]);
  const endInclusive = useMemo(() => {
    const d = new Date(endExclusive);
    d.setDate(d.getDate() - 1);
    return d;
  }, [endExclusive]);

  function fmtJP(d) { return `${d.getMonth() + 1}月${d.getDate()}日`; }

  const periodLabel = useMemo(() => {
    const m = start.getMonth() + 1;
    return `${m}月（${fmtJP(start)}～${fmtJP(endInclusive)}）`;
  }, [start, endInclusive]);

  // ★残高シミュレーションロジック（ここを整理しました）
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

  const getAmountColor = (val) => {
    if (val > 0) return "#4ade80";
    if (val < 0) return "#f87171";
    return "inherit";
  };

  return (
    <main className="container">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>金欠or貯金シミュレーター</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.8 }}>月の開始日：{monthStartDay}日</p>
      </header>

      {/* --- 収支カード --- */}
      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>{periodLabel}（収支）</h2>
        <div style={{ marginBottom: 10 }}>
          <label>今月開始時の残高：
            <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} style={{ marginLeft: 8, padding: 6, borderRadius: 8 }} /> 円
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <MiniStat label="支出合計" value={yen(expenseThisMonth)} />
          <MiniStat label="収入合計" value={yen(incomeThisMonth)} />
          <MiniStat label="差し引き" value={yen(netThisMonth)} color={getAmountColor(netThisMonth)} />
        </div>

        {running.firstNegative ? (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(255,107,107,0.55)", background: "rgba(255,107,107,0.08)" }}>
            ⚠️ 残高は {fmtJP(running.firstNegative)} にマイナスになります
          </div>
        ) : (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(74,222,128,0.55)", background: "rgba(74,222,128,0.08)" }}>
            ✅ 今月は残高がマイナスになりません
            <div style={{ fontSize: 12, opacity: 0.8 }}>最低残高：{yen(running.minBalance)}</div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btnPrimary" onClick={() => setShowAdd(true)}>＋ 追加（支出/収入）</button>
          <button type="button" className="btn btnDanger" onClick={() => { if (confirm("リセットしますか？")) setState(defaultState()); }}>リセット</button>
        </div>
      </section>

 <section className="card">
  <h2 style={{ margin: "0 0 12px" }}>残高推移（今月）</h2>

  {running.rows.length === 0 ? (
    <div style={{ opacity: 0.5, fontSize: 12 }}>予定されているイベントがありません</div>
  ) : (
    <LineChart rows={running.rows} initialBalance={initialBalance} />
  )}
</section>
function LineChart({ rows, initialBalance }) {
  const width = 640;
  const height = 180;
  const pad = 16;

  const balances = rows.map((r) => r.balance);
  const maxVal = Math.max(...balances, initialBalance, 1);
  const minVal = Math.min(...balances, initialBalance, 0);
  const range = Math.max(1, maxVal - minVal);

  const n = rows.length;

  const xAt = (i) => (n === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (n - 1));
  const yAt = (val) => pad + (1 - (val - minVal) / range) * (height - pad * 2);

  const points = rows
    .map((r, i) => `${xAt(i).toFixed(2)},${yAt(r.balance).toFixed(2)}`)
    .join(" ");

  const zeroY = yAt(0);
  const startY = yAt(initialBalance);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", height: 220, display: "block" }}
      >
        {/* 0円ライン */}
        <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.18)" />

        {/* 初期残高ライン */}
        <line x1="0" y1={startY} x2={width} y2={startY} stroke="rgba(255,255,255,0.08)" />

        {/* 折れ線 */}
        <polyline
          fill="none"
          stroke="rgba(59,130,246,0.95)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />

        {/* 点 */}
        {rows.map((r, i) => {
          const cx = xAt(i);
          const cy = yAt(r.balance);
          const neg = r.balance < 0;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="4.5" fill={neg ? "rgba(248,113,113,0.95)" : "rgba(255,255,255,0.9)"} />
              {/* ざっくり日付ラベル（最初/真ん中/最後） */}
              {(i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(255,255,255,0.55)"
                >
                  {r.date.getDate()}日
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 参考: 最低残高 */}
      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
        最低残高：{yen(running.minBalance)}
      </div>
    </div>
  );
}
      {/* --- モーダル --- */}
      {(showAdd || editing) && (
        <div className="modalOverlay" onMouseDown={() => { setShowAdd(false); setEditing(null); }} style={{ background: "rgba(0,0,0,0.82)" }}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ background: "#11161c" }}>
            <div className="modalHeader">
              <h2 style={{ margin: 0, fontSize: 16 }}>{editing ? "編集" : "追加"}</h2>
              <button className="btn btnSmall" onClick={() => { setShowAdd(false); setEditing(null); }}>閉じる</button>
            </div>
            <div className="hr" />
            <AddForm initialItem={editing} onCancel={() => { setShowAdd(false); setEditing(null); }} onSave={(item) => {
              if (editing) {
                setState((s) => ({ ...s, items: s.items.map((x) => (x.id === item.id ? item : x)) }));
                setEditing(null);
              } else {
                setState((s) => ({ ...s, items: [item, ...s.items] }));
                setShowAdd(false);
              }
            }} />
          </div>
        </div>
      )}

      {/* --- 一覧セクション --- */}
      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>一覧</h2>
        <div style={{ marginBottom: 10, display: "flex", gap: 15, flexWrap: "wrap" }}>
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="select" style={{ width: "auto" }}>
            <option value="all">すべて</option>
            <option value="expense">支出のみ</option>
            <option value="income">収入のみ</option>
          </select>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="select" style={{ width: "auto" }}>
            <option value="dateAsc">日付順（早）</option>
            <option value="dateDesc">日付順（遅）</option>
          </select>
        </div>

        {sortedItems.length === 0 ? (
          <div style={{ opacity: 0.75 }}>まだありません</div>
        ) : (
          <table className="table">
            <thead><tr><th>種別</th><th>項目</th><th>金額</th><th>カテゴリ</th><th>周期</th><th>日付</th><th></th></tr></thead>
            <tbody>
              {sortedItems.map((it) => (
                <tr key={it.id}>
                  <td>{kind(it) === "income" ? "収入" : "支出"}</td>
                  <td>{it.name}</td>
                  <td className="mono" style={{ color: kind(it) === "income" ? "#4ade80" : "#f87171", fontWeight: 700 }}>{kind(it) === "income" ? "+" : "-"}{yen(it.amount)}</td>
                  <td>{categoryLabel(it.category)}</td>
                  <td>{cycleLabel(it.cycle)}</td>
                  <td>{dayLabel(it)}</td>
                  <td>
                    <button className="btn btnSmall" onClick={() => setEditing(it)} style={{ marginRight: 8 }}>編集</button>
                    <button className="btn btnSmall btnDanger" onClick={() => { if (confirm("削除しますか？")) setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) })); }}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* --- 年間セクション --- */}
      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>{year}年（1〜12月）</h2>
        <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 10 }}>
          支出：<b style={{ color: "#f87171" }}>{yen(expenseYearTotal)}</b> ／ 収入：<b style={{ color: "#4ade80" }}>{yen(incomeYearTotal)}</b> ／ 収支：<b style={{ color: getAmountColor(netYearTotal) }}>{yen(netYearTotal)}</b>
        </div>
        <table className="table">
          <thead><tr><th>月</th><th>支出</th><th>収入</th><th>収支</th></tr></thead>
          <tbody>
            {expenseByMonth.map((ex, i) => (
              <tr key={i}>
                <td>{i + 1}月</td>
                <td className="mono" style={{ color: "#f87171" }}>{yen(ex)}</td>
                <td className="mono" style={{ color: "#4ade80" }}>{yen(incomeByMonth[i])}</td>
                <td className="mono" style={{ fontWeight: 800, color: getAmountColor(netByMonth[i]) }}>{yen(netByMonth[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* --- 設定セクション --- */}
      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>設定</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <label>月の開始日：
            <select value={monthStartDay} onChange={(e) => setState(s => ({ ...s, settings: { ...s.settings, monthStartDay: clampMonthStartDay(e.target.value) } }))} className="select" style={{ width: "auto", marginLeft: 8 }}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}日</option>)}
            </select>
          </label>
          <label>年額の表示：
            <select value={state.settings.yearlyMode} onChange={(e) => setState(s => ({ ...s, settings: { ...s.settings, yearlyMode: e.target.value } }))} className="select" style={{ width: "auto", marginLeft: 8 }}>
              <option value="forecast">月割り（forecast）</option>
              <option value="cashflow">支払月に計上（cashflow）</option>
            </select>
          </label>
        </div>
      </section>
      <footer className="footer">© {new Date().getFullYear()} kinketsu-simulator</footer>
    </main>
  );
}

// --- フォームコンポーネント ---
function AddForm({ onSave, onCancel, initialItem }) {
  const [type, setType] = useState(initialItem?.type ?? "expense");
  const [category, setCategory] = useState(initialItem?.category ?? (type === "income" ? "salary" : "fixed"));
  const [name, setName] = useState(initialItem?.name ?? "");
  const [amount, setAmount] = useState(initialItem ? String(initialItem.amount) : "");
  const [cycle, setCycle] = useState(initialItem?.cycle ?? "monthly");
  const [payDay, setPayDay] = useState(initialItem?.payDay == null ? "" : String(initialItem.payDay));
  const [startDate, setStartDate] = useState(initialItem?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(initialItem?.endDate ?? todayISO());
  const [payDate, setPayDate] = useState(initialItem?.payDate ?? todayISO());

  useEffect(() => { if (!initialItem) setCategory(type === "income" ? "salary" : "fixed"); }, [type, initialItem]);

  function submit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim() || !amt) return alert("項目名と金額を入れてね");
    const item = {
      id: initialItem?.id ?? uid(),
      type, name: name.trim(), amount: Math.round(amt), category,
      cycle: (type === "expense" && category === "initial") ? "one_time" : cycle,
      payDate: cycle === "one_time" ? payDate : null,
      payDay: cycle === "one_time" ? null : (payDay ? Number(payDay) : 1),
      startDate: cycle === "one_time" ? null : startDate,
      endDate: cycle === "one_time" ? null : (endDate || null),
    };
    onSave(item);
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <label><span className="label">種別</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className="select">
          <option value="expense">支出</option><option value="income">収入</option>
        </select>
      </label>
      <div className="grid2">
        <label><span className="label">項目名</span><input value={name} onChange={(e) => setName(e.target.value)} className="input" /></label>
        <label><span className="label">金額</span><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="input" /></label>
      </div>
      <label><span className="label">周期</span>
        <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="select">
          <option value="monthly">月額</option><option value="yearly">年額</option><option value="one_time">単発</option>
        </select>
      </label>
      {cycle === "one_time" ? (
        <label><span className="label">日付</span><input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input" /></label>
      ) : (
        <label><span className="label">日（1〜31）</span><input value={payDay} onChange={(e) => setPayDay(e.target.value)} className="input" placeholder="例: 25" /></label>
      )}
      <button type="submit" className="btn btnPrimary" style={{ marginTop: 10 }}>保存</button>
    </form>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || "inherit" }}>{value}</div>
    </div>
  );
}
