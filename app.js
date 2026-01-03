const STORAGE_KEY = "priceCalcRulesV3";

const DEFAULT_RULES = [
  { min: 10000, max: 15000, type: "fixed", value: 1000 },
  { min: 15100, max: 30000, type: "fixed", value: 1500 },
  { min: 30100, max: 70000, type: "fixed", value: 2000 },
  { min: 70100, max: 100000, type: "fixed", value: 2500 },
  { min: 100000, max: null, type: "percent", value: 3 },
];

let rules = loadRules();

/* ===== 유틸 ===== */
function clamp0(n){ return Math.max(0, n); }
function trunc100(n){ return Math.trunc(n / 100) * 100; }

function stripCommas(s){ return String(s ?? "").replace(/,/g, "").trim(); }

function parseMoneyInput(raw){
  const cleaned = stripCommas(raw).replace(/[^\d]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(n){
  if (n === null || typeof n === "undefined") return "";
  return Math.round(n).toLocaleString("ko-KR");
}

function formatWon(n){
  if (n === null || typeof n === "undefined") return "-";
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

function attachCommaFormatter(el, { allowEmpty = true } = {}) {
  el.addEventListener("input", () => {
    const old = el.value;
    const oldPos = el.selectionStart ?? old.length;

    const rawDigits = stripCommas(old).replace(/[^\d]/g, "");
    if (allowEmpty && rawDigits === "") {
      el.value = "";
      return;
    }

    const num = Number(rawDigits || "0");
    const formatted = formatNumber(num);

    const diff = formatted.length - old.length;
    el.value = formatted;
    const newPos = Math.max(0, Math.min(formatted.length, oldPos + diff));
    try { el.setSelectionRange(newPos, newPos); } catch {}
  });
}

/* ===== 규칙 저장/정규화 ===== */
function normalizeRule(r){
  const minRaw = parseMoneyInput(r.min);
  const maxRaw = (r.max === null || r.max === "" || typeof r.max === "undefined") ? null : parseMoneyInput(r.max);
  const type = (r.type === "percent") ? "percent" : "fixed";

  let value;
  if (type === "percent") {
    value = Number(String(r.value ?? "").replace(/[^\d.]/g, ""));
    if (!Number.isFinite(value) || value < 0) value = 0;
  } else {
    const v = parseMoneyInput(r.value);
    value = trunc100(clamp0(v ?? 0));
  }

  const min = trunc100(clamp0(minRaw ?? 0));
  const max = (maxRaw === null) ? null : trunc100(clamp0(maxRaw));

  return { min, max, type, value };
}

function isRuleValid(r){
  if (r.min === null) return false;
  if (r.max !== null && r.max < r.min) return false;
  return true;
}

function saveRules(){
  const cleaned = rules.map(normalizeRule).filter(isRuleValid);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

function loadRules(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RULES.map(normalizeRule);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_RULES.map(normalizeRule);
    const cleaned = parsed.map(normalizeRule).filter(isRuleValid);
    return cleaned.length ? cleaned : DEFAULT_RULES.map(normalizeRule);
  }catch{
    return DEFAULT_RULES.map(normalizeRule);
  }
}

function resetRules(){
  rules = DEFAULT_RULES.map(normalizeRule);
  saveRules();
  renderRules();
  calc();
}

/* ===== 규칙 매칭 ===== */
function matchRule(competitorBasePrice){
  const cp = competitorBasePrice;

  for (const r0 of rules) {
    const r = normalizeRule(r0);
    if (!isRuleValid(r)) continue;

    const inMin = cp >= r.min;
    const inMax = (r.max === null) ? true : (cp <= r.max);

    if (inMin && inMax) {
      let amount = 0;
      if (r.type === "percent") amount = trunc100(cp * (r.value / 100));
      else amount = trunc100(r.value);
      return { rule: r, amount };
    }
  }
  return { rule: null, amount: 0 };
}

function ruleToText(r){
  if (!r) return "-";
  const minTxt = formatNumber(r.min);
  const maxTxt = (r.max === null) ? "∞" : formatNumber(r.max);
  const range = `${minTxt} ~ ${maxTxt}`;
  return (r.type === "percent")
    ? `${range} : ${r.value.toLocaleString("ko-KR")}%`
    : `${range} : ${formatNumber(r.value)}원`;
}

/* ===== 계산 ===== */
function calc(){
  const competitorEl = document.getElementById("competitorPrice");
  const costEl = document.getElementById("costPrice");

  const competitorRaw = parseMoneyInput(competitorEl.value);
  const costRaw = parseMoneyInput(costEl.value);

  const deductionTextEl = document.getElementById("deductionText");
  const expectedPriceTextEl = document.getElementById("expectedPriceText");
  const addValueTextEl = document.getElementById("addValueText");
  const ruleHintEl = document.getElementById("ruleHint");

  if (competitorRaw === null || costRaw === null) {
    deductionTextEl.textContent = "-";
    expectedPriceTextEl.textContent = "-";
    addValueTextEl.textContent = "-";
    addValueTextEl.classList.remove("neg");
    ruleHintEl.textContent = "적용 규칙: -";
    return;
  }

  const competitorBasePrice = trunc100(clamp0(competitorRaw));
  const costPrice = trunc100(clamp0(costRaw));

  // 입력칸도 절삭/표시 동기화
  competitorEl.value = formatNumber(competitorBasePrice);
  costEl.value = formatNumber(costPrice);

  const matched = matchRule(competitorBasePrice);
  const deductionAmount = trunc100(matched.amount);

  const expectedPrice = trunc100(competitorBasePrice - deductionAmount);
  const addValue = trunc100(expectedPrice - costPrice);

  if (matched.rule && matched.rule.type === "percent") {
    deductionTextEl.textContent = `${matched.rule.value.toLocaleString("ko-KR")}% (${formatWon(deductionAmount)})`;
  } else {
    deductionTextEl.textContent = formatWon(deductionAmount);
  }

  expectedPriceTextEl.textContent = formatWon(expectedPrice);
  addValueTextEl.textContent = formatWon(addValue);
  ruleHintEl.textContent = `적용 규칙: ${matched.rule ? ruleToText(matched.rule) : "없음(0원)"}`;

  if (addValue < 0) addValueTextEl.classList.add("neg");
  else addValueTextEl.classList.remove("neg");
}

/* ===== 규칙 편집 UI ===== */
function renderRules(){
  const container = document.getElementById("rulesContainer");
  container.innerHTML = "";

  rules = rules.map(normalizeRule).filter(isRuleValid);
  saveRules();

  rules.forEach((r0, idx) => {
    const r = normalizeRule(r0);

    const row = document.createElement("div");
    row.className = "rulesGrid ruleRow";

    // 최소
    const minInput = document.createElement("input");
    minInput.type = "text";
    minInput.inputMode = "numeric";
    minInput.autocomplete = "off";
    minInput.value = formatNumber(r.min);
    attachCommaFormatter(minInput);

    minInput.addEventListener("blur", () => {
      const v = parseMoneyInput(minInput.value);
      rules[idx].min = trunc100(clamp0(v ?? 0));
      minInput.value = formatNumber(rules[idx].min);
      saveRules();
      calc();
    });

    // 최대
    const maxInput = document.createElement("input");
    maxInput.type = "text";
    maxInput.inputMode = "numeric";
    maxInput.autocomplete = "off";
    maxInput.placeholder = "비우면 이상(∞)";
    maxInput.value = (r.max === null) ? "" : formatNumber(r.max);
    attachCommaFormatter(maxInput, { allowEmpty: true });

    maxInput.addEventListener("blur", () => {
      const raw = stripCommas(maxInput.value);
      if (raw === "") {
        rules[idx].max = null;
        maxInput.value = "";
      } else {
        const v = parseMoneyInput(maxInput.value);
        rules[idx].max = trunc100(clamp0(v ?? 0));
        maxInput.value = formatNumber(rules[idx].max);
      }
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

    // 값
    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.autocomplete = "off";
    valueInput.inputMode = (typeSel.value === "percent") ? "decimal" : "numeric";
    valueInput.value = (typeSel.value === "percent")
      ? String(r.value)
      : formatNumber(r.value);

    valueInput.addEventListener("input", () => {
      if (typeSel.value === "fixed") {
        const rawDigits = stripCommas(valueInput.value).replace(/[^\d]/g, "");
        valueInput.value = rawDigits === "" ? "" : formatNumber(Number(rawDigits));
      } else {
        valueInput.value = String(valueInput.value ?? "").replace(/[^\d.]/g, "");
      }
    });

    valueInput.addEventListener("blur", () => {
      if (typeSel.value === "fixed") {
        const v = parseMoneyInput(valueInput.value);
        rules[idx].value = trunc100(clamp0(v ?? 0));     // ✅ 100원 미만 절삭
        valueInput.value = formatNumber(rules[idx].value); // ✅ 콤마 표시
      } else {
        const v = Number(String(valueInput.value ?? "").replace(/[^\d.]/g, ""));
        rules[idx].value = (Number.isFinite(v) && v >= 0) ? v : 0;
        valueInput.value = String(rules[idx].value);
      }
      saveRules();
      calc();
    });

    typeSel.addEventListener("change", () => {
      rules[idx].type = typeSel.value;
      if (typeSel.value === "fixed") {
        const v = parseMoneyInput(valueInput.value);
        rules[idx].value = trunc100(clamp0(v ?? 0));
        valueInput.inputMode = "numeric";
        valueInput.value = formatNumber(rules[idx].value);
      } else {
        const v = Number(String(valueInput.value ?? "").replace(/[^\d.]/g, ""));
        rules[idx].value = (Number.isFinite(v) && v >= 0) ? v : 0;
        valueInput.inputMode = "decimal";
        valueInput.value = String(rules[idx].value);
      }
      saveRules();
      calc();
    });

    // 우선순위
    const orderWrap = document.createElement("div");
    orderWrap.className = "smallBtnGroup col5";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "smallBtn";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;
    upBtn.addEventListener("click", () => {
      if (idx === 0) return;
      [rules[idx - 1], rules[idx]] = [rules[idx], rules[idx - 1]];
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
      [rules[idx + 1], rules[idx]] = [rules[idx], rules[idx + 1]];
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

function addRule(){
  rules.push({ min: 0, max: null, type: "fixed", value: 0 });
  saveRules();
  renderRules();
  calc();
}

/* ===== 바인딩 ===== */
const competitorEl = document.getElementById("competitorPrice");
const costEl = document.getElementById("costPrice");

attachCommaFormatter(competitorEl, { allowEmpty: true });
attachCommaFormatter(costEl, { allowEmpty: true });

document.getElementById("calcBtn").addEventListener("click", calc);
competitorEl.addEventListener("blur", calc);
costEl.addEventListener("blur", calc);

document.getElementById("addRuleBtn").addEventListener("click", addRule);
document.getElementById("resetRulesBtn").addEventListener("click", resetRules);

/* ✅ ESC가 어디서든 먹게: capture 단계에서 처리 */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key === "Esc") {
    e.preventDefault();
    competitorEl.value = "";
    costEl.value = "";
    calc();
  }
}, true);

renderRules();
calc();
