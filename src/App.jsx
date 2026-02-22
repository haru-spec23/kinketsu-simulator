import { useEffect, useMemo, useState } from "react";

import { defaultState, loadState, saveState } from "./storage.js";
import { calcTotalThisPeriod, getMonthPeriod, dateFromISO, isWithin } from "./calc.js";
import { calcYearByMonth } from "./yearView.js";

// --- ヘルパー関数 ---
function yen(n) {
  return new Intl.NumberFormat("ja-JP").format(Math.round(n)) + "円";
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

/**
 * 期間内のイベント（支出=- / 収入=+）を日付付きで作る
 * ※今月の「期間ラベル」と同じ期間を対象
 */
function buildPeriodEvents(items, settings, now = new Date()) {
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
        events.push({
          date: d,
          id: it.id,
          name: it.name,
          signedAmount: sign * it.amount,
          type: k,
        });
      }
    } else {
      // 月額/年額は、期間にかかる月の候補日から「期間内に入る支払日」を選ぶ
      const a = start;
      const b = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);

      const candidates = [
        new Date(a.getFullYear(), a.getMonth(), it.payDay ?? 1),
        new Date(b.getFullYear(), b.getMonth(), it.payDay ?? 1),
      ];
      const payDate = candidates.find((d) => isWithin(d, start, endExclusive));
      if (payDate) {
        events.push({
          date: payDate,
          id: it.id,
          name: it.name,
          signedAmount: sign * it.amount,
          type: k,
        });
      }
    }
  }

  // 日付昇順
  return events.sort((x, y) => x.date.getTime() - y.date.getTime());
}

/**
 * 「今日時点の残高」を基準に、期間内の残高推移を作る
 * - イベントが今日より未来：今日残高から順に足していく
 * - イベントが今日より過去：今日残高から逆算して期間開始残高を求める
 */
function buildRunningFromTodayBalance(events, todayBalance, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // 期間開始残高を逆算： todayBalance - (期間開始〜今日までのsignedAmount合計)
  const sumUntilToday = events
    .filter((ev) => ev.date.getTime() <= today.getTime())
    .reduce((acc, ev) => acc + ev.signedAmount, 0);

  const startBalance = todayBalance - sumUntilToday;

  // 期間開始から順に残高を作る
  let bal = startBalance;
  let firstNegative = null;
  let minBalance = startBalance;

  const rows = [];
  for (const ev of events) {
    bal += ev.signedAmount;
    if (bal < minBalance) minBalance = bal;
    if (firstNegative == null && bal < 0) firstNegative = ev.date;
    rows.push({ ...ev, balance: bal });
  }

  // 「今日時点の残高」が rows の途中に存在しない場合もあるので
  // グラフは startBalance + rows で描けばOK（todayBalanceは注釈として別に使える）
  return { rows, firstNegative, minBalance, startBalance, today };
}

// --- メインコンポーネント ---
export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState("dateAsc");
  const [editing, setEditing] = useState(null);
  const [filterMode, setFilterMode] = useState("all");

  // 「今日時点の残高」
  const [todayBalance, setTodayBalance] = useState(() => Number(localStorage.getItem("todayBalance") ?? 0));

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    localStorage.setItem("todayBalance", String(todayBalance));
  }, [todayBalance]);

  // データ計算
  const expenseItems = useMemo(() => state.items.filter((x) => kind(x) === "expense"), [state.items]);
  const incomeItems = useMemo(() => state.items.filter((x) => kind(x) === "income"), [state.items]);

  const expenseThisMonth = useMemo(
    () => calcTotalThisPeriod(expenseItems, state.settings, new Date()),
    [expenseItems, state.settings]
  );
  const incomeThisMonth = useMemo(
    () => calcTotalThisPeriod(incomeItems, state.settings, new Date()),
    [incomeItems, state.settings]
  );
  const netThisMonth = incomeThisMonth - expenseThisMonth;

  const year = new Date().getFullYear();
  const expenseByMonth = useMemo(
    () => calcYearByMonth(expenseItems, year, state.settings.yearlyMode),
    [expenseItems, year, state.settings.yearlyMode]
  );
  const incomeByMonth = useMemo(
    () => calcYearByMonth(incomeItems, year, state.settings.yearlyMode),
    [incomeItems, year, state.settings.yearlyMode]
  );
  const netByMonth = expenseByMonth.map((v, i) => incomeByMonth[i] - v);

  const sortedItems = useMemo(() => {
    let arr = [...state.items];
    if (filterMode === "expense") arr = arr.filter((x) => kind(x) === "expense");
    if (filterMode === "income") arr = arr.filter((x) => kind(x) === "income");
    return arr.sort((a, b) =>
      sortMode === "dateAsc" ? sortKeyTime(a) - sortKeyTime(b) : sortKeyTime(b) - sortKeyTime(a)
    );
  }, [state.items, sortMode, filterMode]);

  // 期間ラベル（今月=設定に従う）
  const { start, endExclusive } = getMonthPeriod(new Date(), state.settings.monthStartDay);
  const endInclusive = new Date(new Date(endExclusive).setDate(endExclusive.getDate() - 1));
  const fmtJP = (d) => `${d.getMonth() + 1}月${d.getDate()}日`;
  const periodLabel = `${start.getMonth() + 1}月（${fmtJP(start)}～${fmtJP(endInclusive)}）`;

  // 残高シミュレーション（今日残高基準）
  const periodEvents = useMemo(() => buildPeriodEvents(state.items, state.settings, new Date()), [state.items, state.settings]);

  const running = useMemo(() => {
    return buildRunningFromTodayBalance(periodEvents, todayBalance, new Date());
  }, [periodEvents, todayBalance]);

  // 保存・読込機能
  const handleExport = () => {
    const data = JSON.stringify({ state, todayBalance }, null, 2);
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
        if (parsed.todayBalance !== undefined) setTodayBalance(parsed.todayBalance);
        // 互換：昔のinitialBalanceで保存してた場合
        if (parsed.initialBalance !== undefined && parsed.todayBalance === undefined) {
          setTodayBalance(parsed.initialBalance);
        }
        alert("読み込みが完了しました");
      } catch (err) {
        alert("ファイルの形式が正しくありません");
      }
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
          <label>
            今日時点の残高：
            <input
              type="number"
              value={todayBalance}
              onChange={(e) => setTodayBalance(Number(e.target.value))}
              style={{ marginLeft: 8, padding: 6, borderRadius: 8, width: 140 }}
            />{" "}
            円
          </label>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
            ※この残高を基準に、今月（設定した期間）内の残高推移を逆算して表示します
          </div>
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
          <button className="btn btnPrimary" onClick={() => setShowAdd(true)}>
            ＋ 追加
          </button>
          <button className="btn btnDanger" onClick={() => confirm("リセットしますか？") && setState(defaultState())}>
            リセット
          </button>
        </div>
      </section>

      {/* グラフエリア */}
      <section className="card">
        <h2 style={{ margin: "0 0 12px" }}>残高推移（今月）</h2>

        {periodEvents.length === 0 ? (
          <div style={{ opacity: 0.5, fontSize: 12, textAlign: "center", padding: "20px 0" }}>データがありません</div>
        ) : (
          <LineChartStep
            events={periodEvents}
            startBalance={running.startBalance}
            todayBalance={todayBalance}
            today={running.today}
          />
        )}

        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
          開始残高（逆算）：{yen(running.startBalance)} / 今日残高：{yen(todayBalance)}
        </div>
      </section>

      {/* モーダル */}
      {(showAdd || editing) && (
        <div className="modalOverlay" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHeader">
              <h2>{editing ? "編集" : "追加"}</h2>
              <button className="btn btnSmall" onClick={() => { setShowAdd(false); setEditing(null); }}>
                閉じる
              </button>
            </div>

            <AddForm
              initialItem={editing}
              onCancel={() => { setShowAdd(false); setEditing(null); }}
              onSave={(item) => {
                setState((s) => ({
                  ...s,
                  items: editing ? s.items.map((x) => (x.id === item.id ? item : x)) : [item, ...s.items],
                }));
                setShowAdd(false);
                setEditing(null);
              }}
            />
          </div>
        </div>
      )}

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>一覧</h2>

        <div style={{ marginBottom: 10, display: "flex", gap: 10 }}>
          <select value={filterMode} onChange={(e) => setFilterMode(e.target.value)} className="select">
            <option value="all">すべて</option>
            <option value="expense">支出のみ</option>
            <option value="income">収入のみ</option>
          </select>

          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="select">
            <option value="dateAsc">日付順（早）</option>
            <option value="dateDesc">日付順（遅）</option>
          </select>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>項目</th>
              <th>金額</th>
              <th>日付</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {/* ★上固定：今日残高 */}
            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
              <td style={{ fontWeight: "bold" }}>今日時点の残高（基準）</td>
              <td style={{ fontWeight: "bold", color: todayBalance >= 0 ? "#4ade80" : "#f87171" }}>{yen(todayBalance)}</td>
              <td>{todayISO()}</td>
              <td></td>
            </tr>

            {sortedItems.map((it) => (
              <tr key={it.id}>
                <td>{it.name}</td>
                <td style={{ color: kind(it) === "income" ? "#4ade80" : "#f87171" }}>{yen(it.amount)}</td>
                <td>{dayLabel(it)}</td>
                <td>
                  <button className="btn btnSmall" onClick={() => setEditing(it)}>
                    編集
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>データバックアップ</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" onClick={handleExport}>
            JSONとして保存
          </button>

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

// --- グラフコンポーネント（ステップ＋Y軸） ---
function LineChartStep({ events, startBalance, todayBalance, today }) {
  const width = 760;
  const height = 220;

  const padL = 64;  // Y軸ラベル用
  const padR = 18;
  const padT = 16;
  const padB = 34;

  // データ点：開始点 + イベント後の残高点
  let bal = startBalance;
  const points = [{ date: null, balance: bal, tag: "start" }];

  for (const ev of events) {
    bal += ev.signedAmount;
    points.push({ date: ev.date, balance: bal, tag: "event" });
  }

  const balances = points.map((p) => p.balance);
  const max = Math.max(...balances, 1);
  const min = Math.min(...balances, 0);
  const range = max - min || 1;

  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const getX = (i) => padL + (i * plotW) / Math.max(1, points.length - 1);
  const getY = (val) => padT + (1 - (val - min) / range) * plotH;

  // Y軸目盛り：だいたい5本
  const niceStep = (raw) => {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const r = raw / p;
    const n = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
    return n * p;
  };

  const targetTicks = 5;
  const step = niceStep(range / targetTicks || 1);
  const yMinTick = Math.floor(min / step) * step;
  const yMaxTick = Math.ceil(max / step) * step;

  const ticks = [];
  for (let v = yMinTick; v <= yMaxTick; v += step) ticks.push(v);

  // ステップパス：横→縦（残高はイベント日まで一定）
  const stepPath = () => {
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const x = getX(i);
      const y = getY(points[i].balance);

      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevY = getY(points[i - 1].balance);
        // 横線（前の残高のまま次のxへ）
        d += ` L ${x} ${prevY}`;
        // 縦線（イベントで残高が変わる）
        d += ` L ${x} ${y}`;
      }
    }
    return d;
  };

  const fmtY = (n) => new Intl.NumberFormat("ja-JP").format(Math.round(n));

  return (
    <div style={{ width: "100%", overflowX: "auto", background: "rgba(255,255,255,0.02)", borderRadius: 12 }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 520, height: 260 }}>
        {/* Y軸グリッド＆ラベル */}
        {ticks.map((v) => {
          const y = getY(v);
          const isZero = v === 0;
          return (
            <g key={v}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke={isZero ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)"}
                strokeWidth={isZero ? 2 : 1}
              />
              <text x={padL - 8} y={y + 4} fontSize="10" fill="rgba(255,255,255,0.55)" textAnchor="end">
                {fmtY(v)}円
              </text>
            </g>
          );
        })}

        {/* ステップ線 */}
        <path d={stepPath()} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinejoin="round" />

        {/* 点（イベント発生点だけ目立たせる） */}
        {points.map((p, i) => {
          const x = getX(i);
          const y = getY(p.balance);
          const isEvent = p.tag === "event";
          return (
            <g key={i}>
              {isEvent && <circle cx={x} cy={y} r="4.5" fill={p.balance < 0 ? "#f87171" : "#3b82f6"} />}
              {/* X軸ラベル（間引き） */}
              {p.date && (i === 1 || i === points.length - 1 || i % 3 === 0) && (
                <text x={x} y={height - 10} fontSize="10" fill="rgba(255,255,255,0.4)" textAnchor="middle">
                  {p.date.getDate()}日
                </text>
              )}
            </g>
          );
        })}

        {/* 今日の残高注釈（目印） */}
        <text x={padL} y={padT + 10} fontSize="11" fill="rgba(255,255,255,0.55)">
          今日残高: {fmtY(todayBalance)}円（{today.getMonth() + 1}/{today.getDate()}）
        </text>
      </svg>
    </div>
  );
}

// --- フォーム ---
function AddForm({ onSave, onCancel, initialItem }) {
  const [f, setF] = useState(
    initialItem ?? {
      type: "expense",
      name: "",
      amount: "",
      cycle: "monthly",
      category: "fixed",
      payDay: "1",
      payDate: todayISO(),
    }
  );

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="select">
        <option value="expense">支出</option>
        <option value="income">収入</option>
      </select>

      <input placeholder="項目名" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="input" />
      <input placeholder="金額" type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="input" />

      <select value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value })} className="select">
        <option value="monthly">毎月</option>
        <option value="one_time">単発</option>
      </select>

      {f.cycle === "one_time" ? (
        <input type="date" value={f.payDate} onChange={(e) => setF({ ...f, payDate: e.target.value })} className="input" />
      ) : (
        <input placeholder="日 (1-28)" type="number" value={f.payDay} onChange={(e) => setF({ ...f, payDay: e.target.value })} className="input" />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btnPrimary" onClick={() => onSave({ ...f, amount: Number(f.amount), id: f.id ?? uid() })}>
          保存
        </button>
        <button className="btn" onClick={onCancel}>
          キャンセル
        </button>
      </div>
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
