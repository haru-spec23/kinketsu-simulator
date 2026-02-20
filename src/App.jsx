import { useEffect, useMemo, useState } from "react";
import { defaultState, loadState, saveState } from "./storage.js";
import { calcTotalThisPeriod } from "./calc.js";
import { calcYearByMonth } from "./yearView.js";

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

function categoryLabel(cat) {
  return {
    fixed: "固定費",
    subscription: "サブスク",
    variable: "変動費",
    initial: "初期費用",
    other: "その他",
  }[cat] ?? cat;
}

function cycleLabel(cycle) {
  return {
    monthly: "月額",
    yearly: "年額",
    one_time: "単発",
  }[cycle] ?? cycle;
}

function dayLabel(it) {
  if (it.cycle === "one_time") {
    return it.payDate ? `支払日: ${it.payDate}` : "-";
  }
  const d = it.payDay ?? 1;
  if (it.cycle === "monthly") return `毎月${d}日`;
  if (it.cycle === "yearly") return `毎年${d}日`;
  return "-";
}

export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const totalThisMonth = useMemo(() => {
    const base = calcTotalThisPeriod(state.items, state.settings, new Date());
    // 収入を加算
    const income = state.items
      .filter((x) => (x.type ?? "expense") === "income")
      .reduce((a, b) => a + b.amount, 0);
    return base - income;
  }, [state.items, state.settings]);

  const year = new Date().getFullYear();
  const byMonth = useMemo(() => {
    return calcYearByMonth(state.items, year, state.settings.yearlyMode);
  }, [state.items, state.settings.yearlyMode, year]);

  return (
    <main className="container">
      <section className="card">
        <h2>今月の合計</h2>
        <div style={{ fontSize: 32, fontWeight: 800 }}>
          {yen(totalThisMonth)}
        </div>

        <button className="btn btnPrimary" onClick={() => setShowAdd(true)}>
          ＋ 追加
        </button>
      </section>

      {(showAdd || editing) && (
        <div
          className="modalOverlay"
          onMouseDown={() => {
            setShowAdd(false);
            setEditing(null);
          }}
        >
          <div
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: "#11161c" }}
          >
            <h3>{editing ? "編集" : "追加"}</h3>
            <AddForm
              initialItem={editing}
              onCancel={() => {
                setShowAdd(false);
                setEditing(null);
              }}
              onAdd={(item) => {
                if (editing) {
                  setState((s) => ({
                    ...s,
                    items: s.items.map((x) =>
                      x.id === item.id ? item : x
                    ),
                  }));
                } else {
                  setState((s) => ({
                    ...s,
                    items: [item, ...s.items],
                  }));
                }
                setEditing(null);
                setShowAdd(false);
              }}
            />
          </div>
        </div>
      )}

      <section className="card">
        <h2>一覧</h2>

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
            {state.items.map((it) => {
              const kind = it.type ?? "expense";
              return (
                <tr key={it.id}>
                  <td>{kind === "income" ? "収入" : "支出"}</td>
                  <td>{it.name}</td>
                  <td
                    style={{
                      color:
                        kind === "income" ? "#4ade80" : "#f87171",
                    }}
                  >
                    {kind === "income" ? "+" : "-"}
                    {yen(it.amount)}
                  </td>
                  <td>{categoryLabel(it.category)}</td>
                  <td>{cycleLabel(it.cycle)}</td>
                  <td>{dayLabel(it)}</td>
                  <td>
                    <button
                      className="btn btnSmall"
                      onClick={() => setEditing(it)}
                    >
                      編集
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>{year}年の支払い</h2>
        <div>年合計: {yen(byMonth.reduce((a, b) => a + b, 0))}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8 }}>
          {byMonth.map((v, i) => (
            <MiniStat key={i} label={`${i + 1}月`} value={yen(v)} />
          ))}
        </div>
      </section>
    </main>
  );
}

function AddForm({ onAdd, onCancel, initialItem }) {
  const [type, setType] = useState(initialItem?.type ?? "expense");
  const [category, setCategory] = useState(initialItem?.category ?? "fixed");
  const [name, setName] = useState(initialItem?.name ?? "");
  const [amount, setAmount] = useState(
    initialItem ? String(initialItem.amount) : ""
  );
  const [cycle, setCycle] = useState(initialItem?.cycle ?? "monthly");
  const [payDay, setPayDay] = useState(
    initialItem?.payDay ?? ""
  );
  const [payDate, setPayDate] = useState(
    initialItem?.payDate ?? todayISO()
  );

  const isInitial = category === "initial";

  function submit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim()) return;

    const item = {
      id: initialItem?.id ?? uid(),
      type,
      name,
      amount: amt,
      category,
      cycle: isInitial ? "one_time" : cycle,
      payDay: isInitial ? null : payDay,
      payDate: isInitial ? payDate : null,
    };

    onAdd(item);
  }

  return (
    <form onSubmit={submit}>
      <label>種別</label>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="expense">支出</option>
        <option value="income">収入</option>
      </select>

      <label>項目名</label>
      <input value={name} onChange={(e) => setName(e.target.value)} />

      <label>金額</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} />

      <button type="submit">保存</button>
      <button type="button" onClick={onCancel}>
        キャンセル
      </button>
    </form>
  );
}

function MiniStat({ label, value }) {
  return (
    <div style={{ border: "1px solid #333", padding: 10 }}>
      <div>{label}</div>
      <div>{value}</div>
    </div>
  );
}
