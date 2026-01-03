const STORAGE_KEY = "priceCalcRulesV1";

const DEFAULT_RULES = [
  { min: 10000, max: 15000, type: "fixed", value: 1000 },
  { min: 15100, max: 30000, type: "fixed", value: 1500 },
  { min: 30100, max: 70000, type: "fixed", value: 2000 },
  { min: 70100, max: 100000, type: "fixed", value: 2500 },
  { min: 100000, max: null, type: "percent", value: 3 }, // 3%
];

let rules = loadRules();

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatWon(n) {
  if (n === null) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function normalizeRule(r) {
  const min = toNumber(r.min);
  const max = (r.max === null || r.max === "" || typeof r.max === "undefined") ? null : toNumber(r.max);
  const type = (r.type === "percent") ? "percent" : "fixed";
  const value = toNumber(r.value);

  return {
    min: (min === null || min < 0) ? 0 : Math.floor(min),
    max: (max === null) ? null : Math.floor(Math.max(0, max)),
    type,
    value: (value === null || value < 0) ? 0 : value
  };
}

function isRuleValid(r) {
  if (r.min === null) return false;
  if (r.max !== null && r.max < r.min) return false;
  return true;
}

function saveRules() {
  const cleaned = rules.map(normalizeRule);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES.map(normalizeRule);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RULES.map(normalizeRule);
    const cleaned = parsed.map(normalizeRule).filter(isRuleValid);
    return cleaned.length ? cleaned : DEFAULT_RULES.map(normalizeRule);
  } catch {
    return DEFAULT_RULES.map(normalizeRule);
  }
}

function resetRules() {
  rules = DEFAULT_RULES.map(normalizeRule);
  saveRules();
  renderRules();
  calc();
}

function matchRule(competitorPrice) {
  const cp = competitorPrice;

  for (const r0 of rules) {
    const r = normalizeRule(r0);
    if (!isRuleValid(r)) continue;

    const inMin = cp >= r.min;
    const inMax = (r.max === null) ? true : (cp <= r.max);

    if (inMin && inMax) {
      let amount = 0;
      if (r.type === "percent") {
        amount = Math.round(cp * (r.value / 100));
      } else {
        amount = Math.round(r.value);
      }
      return { rule: r, amount };
    }
  }
  return { rule: null, amount: 0 };
}

function ruleToText(r) {
  if (!r) return "-";
  const minTxt = `${r.min.toLocaleString("ko-KR")}`;
  const maxTxt = (r.max === null) ? "∞" : `${r.max.toLocaleString("ko-KR")}`;
  const range = `${minTxt} ~ ${maxTxt}`;

  if (r.type === "percent") return `${range} : ${r.value}%`;
  return `${range} : ${Math.round(r.value).toLocaleString("ko-KR")}원`;
}

/** 계산: 
 *  예상판매가 = 경쟁사 가격 - 뺄 금액
 *  판매가 더하기 = 예상판매가 - 원가 = 경쟁사 가격 - 원가 - 뺄 금액
 */
function calc() {
  const competitorPrice = toNumber(document.getElementById("competitorPrice").value);
  const costPrice = toNumber(document.getElementById("costPrice").value);

  const deductionTextEl = document.getElementById("deductionText");
  const expectedPriceTextEl = document.getElementById("expectedPriceText");
  const addValueTextEl = document.getElementById("addValueText");
  const ruleHintEl = document.getElementById("ruleHint");

  if (competitorPrice === null || costPrice === null) {
    deductionTextEl.textContent = "-";
    expectedPriceTextEl.textContent = "-";
    addValueTextEl.textContent = "-";
    ruleHintEl.textContent = "적용 규칙: -";
    return;
  }

  const matched = matchRule(competitorPrice);
  const deductionAmount = matched.amount;

  const expectedPrice = competitorPrice - deductionAmount;
  const addValue = expectedPrice - costPrice;

  // 표시(퍼센트면 “3% (3,000원)” 형태)
  if (matched.rule && matched.rule.type === "percent") {
    deductionTextEl.textContent = `${matched.rule.value}% (${formatWon(deductionAmount)})`;
  } else {
    deductionTextEl.textContent = formatWon(deductionAmount);
  }

  expectedPriceTextEl.textContent = formatWon(expectedPrice);
  addValueTextEl.textContent = formatWon(addValue);
  ruleHintEl.textContent = `적용 규칙: ${matched.rule ? ruleToText(matched.rule) : "없음(0원)"}`;
}

/* =========================
   규칙 편집 UI
========================= */
function renderRules() {
  const container = document.getElementById("rulesContainer");
  container.innerHTML = "";

  rules.forEach((r0, idx) => {
    const r = normalizeRule(r0);

    const row = document.createElement("div");
    row.className = "rulesGrid ruleRow";

    // 최소
    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.min = "0";
    minInput.value = r.min ?? 0;
    minInput.addEventListener("input", () => {
      rules[idx].min = toNumber(minInput.value) ?? 0;
      saveRules();
      calc();
    });

    // 최대(비우면 null)
    const maxInput = document.createElement("input");
    maxInput.type = "number";
    maxInput.min = "0";
    maxInput.placeholder = "비우면 이상(∞)";
    maxInput.value = (r.max === null) ? "" : r.max;
    maxInput.addEventListener("input", () => {
      const v = maxInput.value;
      rules[idx].max = (v === "") ? null : (toNumber(v) ?? null);
      saveRules();
      calc();
    });

    // 방식
    const typeSel = document.createElement("select");
    const optFixed = document.createElement("option");
    optFixed.value = "fixed";
    optFixed.textContent = "고정(원)";
    const optPercent = document.createElement("option");
    optPercent.value = "percent";
    optPercent.textContent = "퍼센트(%)";
    typeSel.append(optFixed, optPercent);
    typeSel.value = r.type;
    typeSel.addEventListener("change", () => {
      rules[idx].type = typeSel.value;
      saveRules();
      calc();
      renderRules(); // 값 placeholder 갱신
    });

    // 값
    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.min = "0";
    valueInput.placeholder = (typeSel.value === "percent") ? "예: 3" : "예: 1500";
    valueInput.value = r.value ?? 0;
    valueInput.addEventListener("input", () => {
      rules[idx].value = toNumber(valueInput.value) ?? 0;
      saveRules();
      calc();
    });

    // 우선순위(위/아래)
    const orderWrap = document.createElement("div");
    orderWrap.className = "smallBtnGroup col5";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "smallBtn";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      const tmp = rules[idx - 1];
      rules[idx - 1] = rules[idx];
      rules[idx] = tmp;
      saveRules();
      renderRules();
      calc();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "smallBtn";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === rules.length - 1;
    downBtn.addEventListener("click", () => {
      if (idx === rules.length - 1) return;
      const tmp = rules[idx + 1];
      rules[idx + 1] = rules[idx];
      rules[idx] = tmp;
      saveRules();
      renderRules();
      calc();
    });

    orderWrap.append(upBtn, downBtn);

    // 삭제
    const delWrap = document.createElement("div");
    delWrap.className = "col6";

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "smallBtn danger";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      rules.splice(idx, 1);
      saveRules();
      renderRules();
      calc();
    });

    delWrap.appendChild(delBtn);

    row.append(minInput, maxInput, typeSel, valueInput, orderWrap, delWrap);
    container.appendChild(row);
  });
}

function addRule() {
  rules.push({ min: 0, max: null, type: "fixed", value: 0 });
  saveRules();
  renderRules();
  calc();
}

/* =========================
   이벤트 바인딩
========================= */
document.getElementById("calcBtn").addEventListener("click", calc);
document.getElementById("competitorPrice").addEventListener("input", calc);
document.getElementById("costPrice").addEventListener("input", calc);

document.getElementById("addRuleBtn").addEventListener("click", addRule);
document.getElementById("resetRulesBtn").addEventListener("click", resetRules);

renderRules();
calc();

