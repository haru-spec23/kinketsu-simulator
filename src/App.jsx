import { useEffect, useMemo, useState } from "react";
import { defaultState, loadState, saveState } from "./storage.js";
import { calcTotalThisPeriod, getMonthPeriod, dateFromISO, isWithin } from "./calc.js";
import { calcYearByMonth } from "./yearView.js";

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
  // 既存データは type が無いので expense 扱い
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

// 並び替え用のキー（MVP版）
// one_time: payDate
// recurring: 今月のpayDayで並べる（残高シミュのイベント生成で後で強化できる）
function sortKeyTime(it) {
  if (it.cycle === "one_time") {
    return it.payDate ? new Date(it.payDate).getTime() : Number.POSITIVE_INFINITY;
  }
  const d = it.payDay ?? 1;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), d).getTime();
}

// 今月のイベント（簡易）を作る：残高シミュの第一歩
function buildThisPeriodEvents(items, settings, now = new Date()) {
  const { start, endExclusive } = getMonthPeriod(now, settings.monthStartDay);

  const events = [];

  for (const it of items) {
    if (!it || typeof it.amount !== "number") continue;

    const k = kind(it);
    const sign = k === "income" ? +1 : -1;

    // one_time
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
      continue;
    }

    // recurring（monthly/yearly）：この期間に「支払日が存在するか」だけ見る簡易版
    // 期間が2ヶ月跨るので、期間start月とend-1日月の2候補をチェック
    const a = start;
    const b = new Date(endExclusive.getFullYear(), endExclusive.getMonth(), endExclusive.getDate() - 1);

    const candidates = [
      new Date(a.getFullYear(), a.getMonth(), it.payDay ?? 1),
      new Date(b.getFullYear(), b.getMonth(), it.payDay ?? 1),
    ];

    const payDate = candidates.find((d) => isWithin(d, start, endExclusive));
    if (!payDate) continue;

    // 年額はモードにより扱いが変わるが、イベント生成は「発生月に置く」(cashflow相当)でOK
    // forecast（月割り）はイベント化ではなく、月集計向け。残高推移は基本 cashflow 的にするのが自然。
    if (it.cycle === "monthly" || it.cycle === "yearly") {
      events.push({
        date: payDate,
        id: it.id,
        name: it.name,
        signedAmount: sign * it.amount,
        type: k,
      });
    }
  }

  events.sort((x, y) => x.date.getTime() - y.date.getTime());
  return events;
}

export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState("dateAsc");
  const [editing, setEditing] = useState(null);
  const [initialBalance, setInitialBalance] = useState(() => {
    const v = localStorage.getItem("initialBalance");
    return v ? Number(v) : 0;
  });
  const [sortMode, setSortMode] = useState("dateAsc"); // "dateAsc" | "dateDesc"
  const [editing, setEditing] = useState(null); // item or null

  // 保存
  useEffect(() => {
    saveState(state);
  }, [state]);
useEffect(() => {
  localStorage.setItem("initialBalance", String(initialBalance));
}, [initialBalance]);
  
  const expenseItems = useMemo(() => state.items.filter((x) => kind(x) === "expense"), [state.items]);
  const incomeItems = useMemo(() => state.items.filter((x) => kind(x) === "income"), [state.items]);

  const expenseThisMonth = useMemo(() => {
    return calcTotalThisPeriod(expenseItems, state.settings, new Date());
  }, [expenseItems, state.settings]);

  const incomeThisMonth = useMemo(() => {
    return calcTotalThisPeriod(incomeItems, state.settings, new Date());
  }, [incomeItems, state.settings]);

  const netThisMonth = useMemo(() => incomeThisMonth - expenseThisMonth, [incomeThisMonth, expenseThisMonth]);

  const year = new Date().getFullYear();
  const byMonth = useMemo(() => {
    // 年間支払い（既存仕様どおり：支出のみを表示）
    return calcYearByMonth(expenseItems, year, state.settings.yearlyMode);
  }, [expenseItems, year, state.settings.yearlyMode]);

  const expenseByMonth = useMemo(() => {
  return calcYearByMonth(expenseItems, year, state.settings.yearlyMode);
}, [expenseItems, year, state.settings.yearlyMode]);

const incomeByMonth = useMemo(() => {
  // 年間の「収入」を出したいので incomeItems を渡す
  return calcYearByMonth(incomeItems, year, state.settings.yearlyMode);
}, [incomeItems, year, state.settings.yearlyMode]);

const netByMonth = useMemo(() => {
  return expenseByMonth.map((v, i) => incomeByMonth[i] - v);
}, [expenseByMonth, incomeByMonth]);

const expenseYearTotal = useMemo(() => expenseByMonth.reduce((a, b) => a + b, 0), [expenseByMonth]);
const incomeYearTotal = useMemo(() => incomeByMonth.reduce((a, b) => a + b, 0), [incomeByMonth]);
const netYearTotal = useMemo(() => netByMonth.reduce((a, b) => a + b, 0), [netByMonth]);
  
  const yearTotal = useMemo(() => byMonth.reduce((a, b) => a + b, 0), [byMonth]);

  const sortedItems = useMemo(() => {
    const arr = [...state.items];
    arr.sort((a, b) => {
      const ka = sortKeyTime(a);
      const kb = sortKeyTime(b);
      return sortMode === "dateAsc" ? ka - kb : kb - ka;
    });
    return arr;
  }, [state.items, sortMode]);

  const monthStartDay = state.settings.monthStartDay;

  const now = new Date();
const { start, endExclusive } = useMemo(
  () => getMonthPeriod(now, monthStartDay),
  [now, monthStartDay]
);

// endExclusive の前日を作る
const endInclusive = useMemo(() => {
  const d = new Date(endExclusive);
  d.setDate(d.getDate() - 1);
  return d;
}, [endExclusive]);

function fmtJP(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

const periodLabel = useMemo(() => {
  const m = start.getMonth() + 1;
  return `${m}月（${fmtJP(start)}～${fmtJP(endInclusive)}）`;
}, [start, endInclusive]);

  // 残高シミュ用（まだ「初期残高」は未入力なので、まずは0スタートで“マイナス日が出るか”を見る）
// 修正版：残高シミュレーションロジック
  const thisEvents = useMemo(() => buildThisPeriodEvents(state.items, state.settings, new Date()), [state.items, state.settings]);

  const running = useMemo(() => {
    let bal = initialBalance;
    let firstNegative = null;
    let minBalance = initialBalance;

    const rows = thisEvents.map((ev) => {
      bal += ev.signedAmount;
      if (bal < minBalance) minBalance = bal;
      if (firstNegative == null && bal < 0) {
        firstNegative = ev.date;
      }
      return { ...ev, balance: bal };
    });

    return { rows, firstNegative, minBalance };
  }, [thisEvents, initialBalance]);

  // ヘルパー関数：金額に応じた色を返す（追加要望4への準備）
  const getAmountColor = (val) => {
    if (val > 0) return "#4ade80"; // 緑
    if (val < 0) return "#f87171"; // 赤
    return "inherit";
  };
  return (
    <main className="container">
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>金欠or貯金シミュレーター</h1>
        <p style={{ margin: "6px 0 0", opacity: 0.8 }}>月の開始日（集計区切り）：{monthStartDay}日</p>
      </header>

      <section className="card">
       <h2 style={{ margin: "0 0 8px" }}>{periodLabel}（収支）</h2>
        <div style={{ marginBottom: 10 }}>
  <label>
    今月開始時の残高：
    <input
      type="number"
      value={initialBalance}
      onChange={(e) => setInitialBalance(Number(e.target.value))}
      style={{ marginLeft: 8, padding: 6, borderRadius: 8 }}
    />
    円
  </label>
</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <MiniStat label="支出合計" value={yen(expenseThisMonth)} />
          <MiniStat label="収入合計" value={yen(incomeThisMonth)} />
          <MiniStat label="差し引き" value={yen(netThisMonth)} />
        </div>

       {running.firstNegative ? (
  <div
    style={{
      marginTop: 12,
      padding: 10,
      borderRadius: 12,
      border: "1px solid rgba(255,107,107,0.55)",
      background: "rgba(255,107,107,0.08)",
    }}
  >
    ⚠️ 残高は
    {" "}
    {`${running.firstNegative.getMonth() + 1}月${running.firstNegative.getDate()}日`}
    {" "}
    にマイナスになります
  </div>
) : (
  <div
    style={{
      marginTop: 12,
      padding: 10,
      borderRadius: 12,
      border: "1px solid rgba(74,222,128,0.55)",
      background: "rgba(74,222,128,0.08)",
    }}
  >
    ✅ 今月は残高がマイナスになりません
    <div style={{ fontSize: 12, opacity: 0.8 }}>
      最低残高：{yen(running.minBalance)}
    </div>
  </div>
)}
          <div style={{ marginTop: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(255,107,107,0.55)" }}>
            ⚠️ 0円スタートで計算すると、{" "}
            {`${running.firstNegative.getFullYear()}-${String(running.firstNegative.getMonth() + 1).padStart(2, "0")}-${String(
              running.firstNegative.getDate()
            ).padStart(2, "0")}`}
            {" "}に残高がマイナスになります
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn btnPrimary" onClick={() => setShowAdd(true)}>
            ＋ 追加（支出/収入）
          </button>

          <button
            type="button"
            className="btn btnDanger"
            onClick={() => {
              if (confirm("ローカルデータをリセットしますか？")) {
                setState(defaultState());
              }
            }}
          >
            リセット
          </button>
        </div>
      </section>

      {(showAdd || editing) && (
        <div
          className="modalOverlay"
          onMouseDown={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          style={{ background: "rgba(0,0,0,0.82)" }}
        >
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ background: "#11161c", opacity: 1 }}>
            <div className="modalHeader">
              <h2 style={{ margin: 0, fontSize: 16 }}>{editing ? "編集" : "追加"}</h2>
              <button
                className="btn btnSmall"
                type="button"
                onClick={() => {
                  setShowAdd(false);
                  setEditing(null);
                }}
              >
                閉じる
              </button>
            </div>

            <div className="hr" />

            <AddForm
              initialItem={editing}
              onCancel={() => {
                setShowAdd(false);
                setEditing(null);
              }}
              onSave={(item) => {
                if (editing) {
                  setState((s) => ({
                    ...s,
                    items: s.items.map((x) => (x.id === item.id ? item : x)),
                  }));
                  setEditing(null);
                } else {
                  setState((s) => ({ ...s, items: [item, ...s.items] }));
                  setShowAdd(false);
                }
              }}
            />
          </div>
        </div>
      )}

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>一覧</h2>

        <div style={{ marginBottom: 10 }}>
          並び替え：
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="select" style={{ width: "auto", marginLeft: 8 }}>
            <option value="dateAsc">日付が早い順</option>
            <option value="dateDesc">日付が遅い順</option>
          </select>
        </div>

        {sortedItems.length === 0 ? (
          <div style={{ opacity: 0.75 }}>まだありません</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>種別</th>
                <th>項目</th>
                <th>金額</th>
                <th>カテゴリ</th>
                <th>周期</th>
                <th>日付</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.slice(0, 50).map((it) => {
                const k = kind(it);
                return (
                  <tr key={it.id}>
                    <td>{k === "income" ? "収入" : "支出"}</td>
                    <td>{it.name}</td>
                    <td
                      className="mono"
                      style={{
                        color: k === "income" ? "#4ade80" : "#f87171",
                        fontWeight: 700,
                      }}
                    >
                      {k === "income" ? "+" : "-"}
                      {yen(it.amount)}
                    </td>
                    <td>{categoryLabel(it.category)}</td>
                    <td>{cycleLabel(it.cycle)}</td>
                    <td>{dayLabel(it)}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className="btn btnSmall"
                          onClick={() => {
                            setEditing(it);
                            setShowAdd(false);
                          }}
                        >
                          編集
                        </button>

                        <button
                          type="button"
                          className="btn btnSmall btnDanger"
                          onClick={() => {
                            if (!confirm("この項目を削除しますか？")) return;
                            setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) }));
                          }}
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

<section className="card">
  <h2 style={{ margin: "0 0 8px" }}>{year}年（1〜12月）</h2>

  <div style={{ fontSize: 14, opacity: 0.8, marginBottom: 10 }}>
    支出：<b>{yen(expenseYearTotal)}</b> ／ 収入：<b>{yen(incomeYearTotal)}</b> ／ 収支：<b>{yen(netYearTotal)}</b>
    （年額モード：{state.settings.yearlyMode}）
  </div>

  <table className="table">
    <thead>
      <tr>
        <th>月</th>
        <th>支出</th>
        <th>収入</th>
        <th>収支</th>
      </tr>
    </thead>
    <tbody>
      {expenseByMonth.map((ex, i) => {
        const inc = incomeByMonth[i];
        const net = netByMonth[i];
        return (
          <tr key={i}>
            <td>{i + 1}月</td>
            <td className="mono" style={{ color: "#f87171", fontWeight: 700 }}>{yen(ex)}</td>
            <td className="mono" style={{ color: "#4ade80", fontWeight: 700 }}>{yen(inc)}</td>
            <td className="mono" style={{ fontWeight: 800 }}>{yen(net)}</td>
          </tr>
        );
      })}
    </tbody>
  </table>

  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 10 }}>
    ※ この表は暦月（1日〜末日）で集計しています。
  </div>
</section>

      <section className="card">
        <h2 style={{ margin: "0 0 8px" }}>設定</h2>

        <label style={{ display: "block", marginBottom: 10 }}>
          月の開始日（1〜28）：
          <select
            value={monthStartDay}
            onChange={(e) => {
              const next = clampMonthStartDay(e.target.value);
              setState((s) => ({ ...s, settings: { ...s.settings, monthStartDay: next } }));
            }}
            className="select"
            style={{ width: "auto", marginLeft: 8 }}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}日
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          年額の表示：
          <select
            value={state.settings.yearlyMode}
            onChange={(e) => {
              const next = e.target.value === "cashflow" ? "cashflow" : "forecast";
              setState((s) => ({ ...s, settings: { ...s.settings, yearlyMode: next } }));
            }}
            className="select"
            style={{ width: "auto", marginLeft: 8 }}
          >
            <option value="forecast">月割り（forecast）</option>
            <option value="cashflow">支払月に計上（cashflow）</option>
          </select>
        </label>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>※ 設定とデータは端末内（localStorage）に保存されます</div>
      </section>

      <footer className="footer">© {new Date().getFullYear()} kinketsu-simulator</footer>
    </main>
  );
}

function AddForm({ onSave, onCancel, initialItem }) {
  const [type, setType] = useState(initialItem?.type ?? "expense");

  // expense categories / income categories を分ける
  const defaultCat = (initialItem?.category ?? (type === "income" ? "salary" : "fixed"));
  const [category, setCategory] = useState(defaultCat);

  const [name, setName] = useState(initialItem?.name ?? "");
  const [amount, setAmount] = useState(initialItem ? String(initialItem.amount) : "");

  // cycle
  const [cycle, setCycle] = useState(initialItem?.cycle ?? "monthly");

  const [payDay, setPayDay] = useState(initialItem?.payDay == null ? "" : String(initialItem.payDay));
 const [startDate, setStartDate] = useState(initialItem?.startDate ?? todayISO());
const [endDate, setEndDate] = useState(
  (initialItem?.endDate ?? initialItem?.startDate) ?? todayISO()
);
  const [payDate, setPayDate] = useState(initialItem?.payDate ?? todayISO());

  const isInitialExpense = type === "expense" && category === "initial";
  const isOneTime = type === "income" ? cycle === "one_time" : isInitialExpense;

  // 初期費用は強制 one_time
  useEffect(() => {
    if (isInitialExpense) setCycle("one_time");
  }, [isInitialExpense]);

  // 種別切替時にカテゴリのデフォルトを合わせる（見た目用）
  useEffect(() => {
    if (initialItem) return; // 編集時は変えない
    setCategory(type === "income" ? "salary" : "fixed");
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

 function submit(e) {
  e.preventDefault();
  const amt = Number(amount);
  if (!name.trim()) return alert("項目名を入れてね");
  if (!Number.isFinite(amt) || amt <= 0) return alert("金額は正の数で入れてね");

  // ★ ここに追加
  const singleDay = !!startDate && !!endDate && startDate === endDate;

  let finalCycle = isOneTime ? "one_time" : cycle;

  if (!isOneTime && singleDay) {
    finalCycle = "one_time";
  }

  const item = {
    id: initialItem?.id ?? uid(),
    type,
    name: name.trim(),
    amount: Math.round(amt),
    category,
    cycle: finalCycle,

    payDate: finalCycle === "one_time" ? (payDate ?? startDate) : null,
    payDay: finalCycle === "one_time"
      ? null
      : (payDay
          ? Math.max(1, Math.min(31, Math.trunc(Number(payDay))))
          : null),

    startDate: finalCycle === "one_time" ? null : startDate,
    endDate: finalCycle === "one_time" ? null : (endDate || null),
  };

  onSave(item);
}

  const payWord = type === "income" ? "入金" : "引き落とし";

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <label>
        <span className="label">種別</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className="select">
          <option value="expense">支出</option>
          <option value="income">収入</option>
        </select>
      </label>

      <label>
        <span className="label">カテゴリ</span>
        {type === "expense" ? (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
            <option value="fixed">固定費</option>
            <option value="subscription">サブスク</option>
            <option value="variable">変動費</option>
            <option value="initial">初期費用</option>
            <option value="other">その他</option>
          </select>
        ) : (
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="select">
            <option value="salary">給料</option>
            <option value="bonus">単発収入</option>
            <option value="other_income">その他収入</option>
          </select>
        )}
      </label>

      <div className="grid2">
        <label>
          <span className="label">項目名</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>

        <label>
          <span className="label">金額（円）</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="input" />
        </label>
      </div>

      {/* cycle / date controls */}
      {type === "income" ? (
        <>
          <label>
            <span className="label">周期</span>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="select">
              <option value="monthly">月額</option>
              <option value="yearly">年額</option>
              <option value="one_time">単発</option>
            </select>
          </label>

          {cycle !== "one_time" ? (
            <>
              <div className="grid2">
                <label>
                  <span className="label">{payWord}日（空欄=1日扱い）</span>
                  <input value={payDay} onChange={(e) => setPayDay(e.target.value)} inputMode="numeric" className="input" placeholder="例：25" />
                </label>

                <label>
                  <span className="label">開始日</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
                </label>
              </div>

              <label>
                <span className="label">終了日（任意）</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </label>
            </>
          ) : (
            <label>
              <span className="label">{payWord}日</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input" />
            </label>
          )}
        </>
      ) : (
        <>
          {/* expense */}
          {!isInitialExpense ? (
            <>
              <label>
                <span className="label">周期</span>
                <select value={cycle} onChange={(e) => setCycle(e.target.value)} className="select">
                  <option value="monthly">月額</option>
                  <option value="yearly">年額</option>
                </select>
              </label>

              <div className="grid2">
                <label>
                  <span className="label">{payWord}日（空欄=1日扱い）</span>
                  <input value={payDay} onChange={(e) => setPayDay(e.target.value)} inputMode="numeric" className="input" placeholder="例：25" />
                </label>

                <label>
                  <span className="label">開始日</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
                </label>
              </div>

              <label>
                <span className="label">終了日（任意）</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
              </label>
            </>
          ) : (
            <label>
              <span className="label">支払日</span>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="input" />
            </label>
          )}
        </>
      )}

      <div className="row">
        <button type="submit" className="btn btnPrimary">
          保存
        </button>
        <button type="button" onClick={onCancel} className="btn">
          キャンセル
        </button>
      </div>
    </form>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.10)", borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
