import { useEffect, useMemo, useState } from "react";
import { defaultState, loadState, saveState } from "./storage.js";
import { calcTotalThisPeriod } from "./calc.js";

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

function categoryLabel(cat) {
  return (
    {
      fixed: "固定費",
      subscription: "サブスク",
      variable: "変動費",
      initial: "初期費用",
      other: "その他",
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
  if (it.cycle === "one_time") {
    return it.payDate ? `支払日: ${it.payDate}` : "支払日: -";
  }
  const d = it.payDay ?? 1;
  if (it.cycle === "monthly") return `引落: 毎月${d}日`;
  if (it.cycle === "yearly") return `引落: 毎年${d}日`;
  return "-";
}

// 並び替え用のキー（MVP版）
// one_time: payDate
// recurring: 今月のpayDayで並べる（④で月別支払生成を作ったら強化できる）
function sortKeyTime(it) {
  if (it.cycle === "one_time") {
    return it.payDate ? new Date(it.payDate).getTime() : Number.POSITIVE_INFINITY;
  }
  const d = it.payDay ?? 1;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), d).getTime();
}

export default function App() {
  const [state, setState] = useState(() => loadState() ?? defaultState());
  const [showAdd, setShowAdd] = useState(false);
  const [sortMode, setSortMode] = useState("dateAsc"); // "dateAsc" | "dateDesc"

  // 保存
  useEffect(() => {
    saveState(state);
  }, [state]);

  const totalThisMonth = useMemo(() => {
    return calcTotalThisPeriod(state.items, state.settings, new Date());
  }, [state.items, state.settings]);

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

  return (
    <main style={pageStyle()}>
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
          <button type="button" onClick={() => setShowAdd(true)} style={btnStyle("solid")}>
            ＋ 支出を追加
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("ローカルデータをリセットしますか？")) {
                setState(defaultState());
              }
            }}
            style={btnStyle("ghost")}
          >
            リセット
          </button>
        </div>
      </section>

      {showAdd && (
        <section style={cardStyle()}>
          <h2 style={{ margin: "0 0 8px" }}>支出を追加</h2>
          <AddForm
            onCancel={() => setShowAdd(false)}
            onAdd={(item) => {
              setState((s) => ({ ...s, items: [item, ...s.items] }));
              setShowAdd(false);
            }}
          />
        </section>
      )}

      <section style={cardStyle()}>
        <h2 style={{ margin: "0 0 8px" }}>一覧（最新10件）</h2>

        <div style={{ marginBottom: 10 }}>
          並び替え：
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            style={{ marginLeft: 8, padding: 6, borderRadius: 8 }}
          >
            <option value="dateAsc">日付が早い順</option>
            <option value="dateDesc">日付が遅い順</option>
          </select>
        </div>

        {sortedItems.length === 0 ? (
          <div style={{ opacity: 0.75 }}>まだありません</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {sortedItems.slice(0, 10).map((it) => (
              <li key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span>
                  {it.name} / {yen(it.amount)} / {categoryLabel(it.category)} / {cycleLabel(it.cycle)} / {dayLabel(it)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("この項目を削除しますか？")) return;
                    setState((s) => ({ ...s, items: s.items.filter((x) => x.id !== it.id) }));
                  }}
                  style={{ ...btnStyle("ghost"), padding: "6px 10px" }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={cardStyle()}>
        <h2 style={{ margin: "0 0 8px" }}>設定</h2>

        <label style={{ display: "block", marginBottom: 10 }}>
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
            style={selectStyle()}
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
            style={selectStyle()}
          >
            <option value="forecast">月割り（forecast）</option>
            <option value="cashflow">支払月に計上（cashflow）</option>
          </select>
        </label>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
          ※ 設定とデータは端末内（localStorage）に保存されます
        </div>
      </section>

      <footer style={{ marginTop: 18, fontSize: 12, opacity: 0.7 }}>
        © {new Date().getFullYear()} kinketsu-simulator
      </footer>
    </main>
  );
}

function AddForm({ onAdd, onCancel }) {
  const [category, setCategory] = useState("fixed");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [payDay, setPayDay] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [payDate, setPayDate] = useState(todayISO());

  const isInitial = category === "initial";
  useEffect(() => {
    if (isInitial) setCycle("one_time");
  }, [isInitial]);

  function submit(e) {
    e.preventDefault();
    const amt = Number(amount);
    if (!name.trim()) return alert("項目名を入れてね");
    if (!Number.isFinite(amt) || amt <= 0) return alert("金額は正の数で入れてね");

    const item = {
      id: uid(),
      name: name.trim(),
      amount: Math.round(amt),
      category,
      cycle: isInitial ? "one_time" : cycle,
      payDay: isInitial ? null : payDay ? Math.max(1, Math.min(31, Math.trunc(Number(payDay)))) : null,
      payDate: isInitial ? payDate : null,
      startDate: isInitial ? null : startDate,
      endDate: isInitial ? null : endDate || null,
    };
    onAdd(item);
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
      <label>
        カテゴリ：
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle()}>
          <option value="fixed">固定費</option>
          <option value="subscription">サブスク</option>
          <option value="variable">変動費</option>
          <option value="initial">初期費用</option>
          <option value="other">その他</option>
        </select>
      </label>

      <label>
        項目名：
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle()} />
      </label>

      <label>
        金額（円）：
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" style={inputStyle()} />
      </label>

      {!isInitial && (
        <>
          <label>
            周期：
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} style={selectStyle()}>
              <option value="monthly">月額</option>
              <option value="yearly">年額</option>
            </select>
          </label>

          <label>
            引き落とし日（空欄=1日扱い）：
            <input
              value={payDay}
              onChange={(e) => setPayDay(e.target.value)}
              inputMode="numeric"
              placeholder="例：25"
              style={inputStyle()}
            />
          </label>

          <label>
            開始日：
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle()} />
          </label>

          <label>
            終了日（任意）：
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle()} />
          </label>
        </>
      )}

      {isInitial && (
        <label>
          支払日：
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={inputStyle()} />
        </label>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" style={btnStyle("solid")}>
          追加
        </button>
        <button type="button" onClick={onCancel} style={btnStyle("ghost")}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

function pageStyle() {
  return {
    fontFamily: "system-ui",
    padding: 16,
    maxWidth: 900,
    margin: "0 auto",
    lineHeight: 1.6,
  };
}

function cardStyle() {
  return {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  };
}

function btnStyle(kind = "solid") {
  const base = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
    cursor: "pointer",
    background: "white",
  };
  if (kind === "ghost") return base;
  return { ...base, fontWeight: 700 };
}

function inputStyle() {
  return {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: 8,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.18)",
  };
}

function selectStyle() {
  return { marginLeft: 8, padding: 6, borderRadius: 8 };
}
