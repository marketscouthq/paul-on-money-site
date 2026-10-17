import { comparePlans, assessEarlyBill, projectHsaGrowth } from './calculator-core.mjs';

const $ = id => document.getElementById(id);
const form = $('calculator');
const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
const value = id => $(id).value;
const num = id => value(id);
const rate = id => value(id) === '' ? '' : String(Number(value(id)) / 100);
let exampleMode = false;
let hasProjected = false;
let hasCalculated = false;
let videoSampleLoaded = false;
let videoSampleEdited = false;

// Paul-approved public video sample. Keep these plan-only values in parity with
// the canonical 2027 self-only, in-network preset; tests enforce the mapping.
const VIDEO_PLAN_SAMPLE = {
  A: { monthly: '91', deductible: '700', coinsurance: '15', maximum: '3500' },
  B: { monthly: '0', deductible: '1900', coinsurance: '20', maximum: '3800', employer: '250' }
};

function inputData() {
  return {
    tier: value('tier'), network: value('network'), allowed: num('allowed'), advanced: false,
    plans: {
      A: { monthly: value('A-monthly'), deductible: value('A-deductible'), coinsurance: rate('A-coinsurance'), maximum: value('A-maximum'), employer: '0' },
      B: { monthly: value('B-monthly'), deductible: value('B-deductible'), coinsurance: rate('B-coinsurance'), maximum: value('B-maximum'), employer: value('B-employer') }
    },
    hsa: {
      eligible: $('eligible').checked,
      payrollEmployee: num('payrollEmployee'), directEmployee: num('directEmployee'), starting: num('starting'), catchUp: num('catchUp'),
      catchUpEligible: $('catchUpEligible').checked, taxEnabled: $('taxEnabled').checked,
      federal: rate('federal'), state: rate('state'), payroll: rate('payroll')
    }
  };
}

function clearErrors() {
  const box = $('errors');
  box.replaceChildren();
  box.hidden = true;
}

function showErrors(errors, focus = false) {
  const box = $('errors');
  box.replaceChildren();
  if (!errors.length) { box.hidden = true; return; }
  const title = document.createElement('h3'); title.textContent = 'Check these entries'; box.append(title);
  const list = document.createElement('ul');
  for (const error of errors) { const item = document.createElement('li'); item.textContent = error.message; list.append(item); }
  box.append(list); box.hidden = false;
  if (focus) box.focus();
}

function renderBars(id, items, { centered = false, max = null } = {}) {
  const box = $(id);
  box.replaceChildren();
  const scale = max ?? Math.max(1, ...items.map(item => Math.abs(item.value)));
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'chart-row';
    const label = document.createElement('span'); label.className = 'chart-label'; label.textContent = item.label;
    const track = document.createElement('span'); track.className = `chart-track${centered ? ' centered-track' : ''}`; track.setAttribute('aria-hidden', 'true');
    const fill = document.createElement('span');
    fill.className = `chart-fill ${item.tone || (item.value < 0 ? 'loss' : 'navy-fill')}`;
    if (centered) {
      fill.style.width = `${Math.min(50, Math.abs(item.value) / scale * 50)}%`;
      if (item.value < 0) fill.style.right = '50%'; else fill.style.left = '50%';
    } else fill.style.width = `${Math.min(100, Math.max(0, item.value) / scale * 100)}%`;
    track.append(fill);
    const amount = document.createElement('strong'); amount.className = 'chart-value'; amount.textContent = money(item.value);
    row.append(label, track, amount); box.append(row);
  }
}

function renderAnnualChart(result) {
  const values = [result.A.economicCost, result.B.economicCost];
  const scale = Math.max(1, ...values.map(Math.abs));
  renderBars('annual-chart', [
    { label: 'Plan A · PPO', value: result.A.economicCost, tone: 'navy-fill' },
    { label: 'Plan B · HDHP/HSA', value: result.B.economicCost, tone: 'gold-fill' }
  ], { centered: true, max: scale });
  $('annual-chart').setAttribute('aria-label', `Estimated net yearly cost: Plan A PPO ${money(result.A.economicCost)}; Plan B HDHP with HSA ${money(result.B.economicCost)}. Zero is at the center and both use the same scale.`);
  $('annual-chart-scale').textContent = `Scale: $${Math.round(scale).toLocaleString('en-US')} in either direction from zero.`;
  for (const [key, plan] of Object.entries({ A: result.A, B: result.B })) {
    $(`premium-${key}`).textContent = money(plan.premium);
    $(`care-${key}`).textContent = money(plan.patient);
    $(`employer-${key}`).textContent = `−${money(plan.employer)}`;
    $(`tax-${key}`).textContent = `−${money(plan.taxBenefit)}`;
    $(`net-${key}`).textContent = money(plan.economicCost);
  }
}

function renderTaxChart(result) {
  const wrap = $('tax-chart-wrap');
  const empty = $('tax-chart-empty');
  if (!result.taxEnabled) {
    wrap.hidden = true; empty.hidden = false;
    $('tax-chart').replaceChildren();
    return;
  }
  const payrollDeposits = Number(value('payrollEmployee'));
  const directDeposits = Number(value('directEmployee'));
  const federal = (payrollDeposits + directDeposits) * Number(rate('federal'));
  const state = (payrollDeposits + directDeposits) * Number(rate('state'));
  const payroll = payrollDeposits * Number(rate('payroll'));
  const categories = [
    { label: 'Federal income tax', value: federal, tone: 'navy-fill' },
    { label: 'State income tax', value: state, tone: 'gold-fill' },
    { label: 'Payroll tax on eligible paycheck deposits', value: payroll, tone: 'teal-fill' }
  ];
  const scale = Math.max(1, ...categories.map(item => item.value));
  renderBars('tax-chart', categories, { max: scale });
  $('tax-chart').setAttribute('aria-label', `Estimated HSA tax savings: federal ${money(federal)}, state ${money(state)}, and payroll tax ${money(payroll)}; total ${money(result.B.taxBenefit)}.`);
  $('tax-chart-scale').textContent = `Scale: $0 to ${money(scale)}; each bar uses the same scale.`;
  $('tax-federal').textContent = money(federal);
  $('tax-state').textContent = money(state);
  $('tax-payroll').textContent = money(payroll);
  $('tax-total').textContent = money(result.B.taxBenefit);
  wrap.hidden = false; empty.hidden = true;
}

function displayResult(result, bill) {
  $('result-empty').hidden = true; $('result-output').hidden = false;
  const relation = result.relation === 'tie'
    ? 'The estimated costs are about the same with the amounts entered.'
    : `Plan ${result.relation} has the lower estimated yearly cost by about ${money(Math.abs(result.difference))}.`;
  $('comparison').textContent = relation + ' This is an estimate, not an enrollment recommendation.';
  $('cost-A').textContent = money(result.A.economicCost);
  $('cost-B').textContent = money(result.B.economicCost);
  renderAnnualChart(result);
  const premium = result.premiumDifference;
  $('premium-difference').textContent = premium.monthly === 0
    ? 'The monthly premiums are the same.'
    : `Plan ${premium.planBLower ? 'B' : 'A'} has a lower monthly premium by ${money(Math.abs(premium.monthly))} (${money(Math.abs(premium.annual))} over 12 months). A lower premium does not guarantee a lower total cost.`;
  const first = result.firstYearPlan;
  $('hsa-summary').textContent = result.hsaAssessed
    ? `After the entered deposits arrive, the HSA would have about ${money(first.totalAfterDeposits)}. Plan B's entered out-of-pocket maximum is ${money(first.coveredCostLimit)}. Check deposit timing and the current contribution limit.`
    : 'HSA eligibility is not confirmed. The yearly estimate still subtracts the employer deposit entered once; verify you would receive it. HSA balances and your own HSA tax savings are not included.';
  $('tax-summary').textContent = result.taxEnabled
    ? `Estimated tax savings on your own deposits: about ${money(result.B.taxBenefit)}. This limited estimate uses the rates entered and is already included once in Plan B’s yearly figure.`
    : 'No estimated tax savings are included.';
  renderTaxChart(result);
  $('warning').textContent = result.warnings.join(' ');
  if (bill) {
    const date = value('billDate');
    $('bill-result').hidden = false;
    $('bill-summary').textContent = bill.funded
      ? `The entered money could cover this bill due ${date}. About ${money(bill.endingHSA)} of the entered HSA amount would remain after the planned payment.`
      : `The entered money is short by about ${money(bill.shortfall)} for this bill due ${date}. Money planned to arrive later is not counted.`;
  } else $('bill-result').hidden = true;
}

function calculatePlan(focus = false) {
  hasCalculated = true;
  $('result-output').hidden = true; $('result-empty').hidden = false; $('bill-result').hidden = true;
  const result = comparePlans(inputData());
  showErrors(result.errors, focus);
  if (!result.ready) return false;
  let bill = null;
  if ($('billEnabled').checked) {
    bill = assessEarlyBill({ mode: 'assess', date: value('billDate'), bill: value('bill'), qualified: value('bill-qualified'), planned: value('bill-planned'), available: value('bill-available'), outsideCash: value('bill-outsideCash') });
    if (!bill.ready) { showErrors(bill.errors, focus); return false; }
  }
  showErrors([]);
  displayResult(result, bill);
  if (focus) $('result-heading').focus();
  return true;
}

function projectionInput() {
  return {
    starting: value('growth-starting'), contribution: value('growth-contribution'),
    returnRate: rate('growth-returnRate'), fundExpenseRate: rate('growth-fundExpenseRate'),
    adminRate: rate('growth-adminRate'), adminFlatFee: value('growth-adminFlatFee'),
    adminUncapped: $('growth-adminUncapped').checked,
    adminCap: $('growth-adminUncapped').checked ? null : value('growth-adminCap')
  };
}

function showGrowthErrors(errors, focus = false) {
  const box = $('growth-errors');
  box.replaceChildren();
  if (!errors.length) { box.hidden = true; return; }
  const title = document.createElement('h4'); title.textContent = 'Check the projection inputs'; box.append(title);
  const list = document.createElement('ul');
  for (const error of errors) {
    const item = document.createElement('li');
    const link = document.createElement('a'); link.setAttribute('href', `#${error.field}`); link.textContent = error.message;
    link.addEventListener('click', event => { event.preventDefault(); $(error.field)?.focus(); });
    item.append(link); list.append(item);
    $(error.field)?.setAttribute('aria-invalid', 'true');
  }
  box.append(list); box.hidden = false;
  if (focus) box.focus();
}

function projectGrowth(focus = false) {
  const output = projectHsaGrowth(projectionInput());
  for (const id of ['growth-starting', 'growth-contribution', 'growth-returnRate', 'growth-fundExpenseRate', 'growth-adminRate', 'growth-adminFlatFee', 'growth-adminCap']) $(id).removeAttribute('aria-invalid');
  showGrowthErrors(output.errors, focus);
  if (!output.ready) { $('growth-result').hidden = true; hasProjected = false; return; }
  const returnPercent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(output.netReturn);
  const feePercent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });
  const capSummary = output.adminUncapped ? 'percentage account fee is uncapped' : `percentage account fee is capped at ${money(output.adminCap)} per year`;
  $('growth-net').textContent = `Assumed yearly return after the fund expense ratio, before separate account fees: ${returnPercent}. Fund expense ratio: ${feePercent.format(Number(rate('growth-fundExpenseRate')))}; percentage account fee: ${feePercent.format(output.adminRate)}, ${capSummary}; fixed account fee: ${money(output.adminFlatFee)} per year. These fees are charged only up to the balance available after returns and fund expenses. Opening balance: ${money(output.starting)}. New deposits are assumed at the end of each year.`;
  const components = output.horizons.flatMap(h => [
    { label: `${h.years} years · deposited principal`, value: h.totalDeposited, tone: 'navy-fill' },
    { label: `${h.years} years · investment gain or loss`, value: h.growth, tone: h.growth < 0 ? 'loss' : 'gold-fill' }
  ]);
  const scale = Math.max(1, ...components.map(item => Math.abs(item.value)));
  renderBars('growth-chart', components, { centered: true, max: scale });
  $('growth-chart').setAttribute('aria-label', output.horizons.map(h => `After ${h.years} years, deposited principal ${money(h.totalDeposited)}, investment gain or loss after fees ${money(h.growth)}, ending balance ${money(h.ending)}.`).join(' '));
  $('growth-chart-scale').textContent = `Scale: $${Math.round(scale).toLocaleString('en-US')} in either direction from zero. Losses extend left of zero.`;
  const rows = $('growth-rows'); rows.replaceChildren();
  for (const horizon of output.horizons) {
    const row = document.createElement('tr');
    for (const amount of [`${horizon.years} years`, money(horizon.totalDeposited), money(horizon.growth), money(horizon.totalAdminFees), money(horizon.ending)]) {
      const cell = document.createElement('td'); cell.textContent = amount; row.append(cell);
    }
    rows.append(row);
  }
  $('growth-result').hidden = false;
  hasProjected = true;
  if (focus) $('growth-chart-heading').focus();
}

function setValue(id, next) { $(id).value = String(next); }

function setCareScenarioSelection(selectedId = null) {
  for (const id of ['care-scenario-light', 'care-scenario-medium', 'care-scenario-high']) {
    $(id).setAttribute('aria-pressed', String(id === selectedId));
  }
}

function setGrowthReturnSelection(selectedId = null) {
  for (const id of ['growth-return-5', 'growth-return-7', 'growth-return-10']) {
    $(id).setAttribute('aria-pressed', String(id === selectedId));
  }
}

function updateVideoSampleState(message = '') {
  const button = $('load-video-plan-sample');
  const status = $('video-plan-sample-status');
  const isSelfOnly = value('tier') === 'employee_only';
  button.disabled = !isSelfOnly;
  if (message) {
    status.textContent = message;
    status.hidden = false;
  } else if (videoSampleLoaded) {
    status.textContent = isSelfOnly
      ? `The video’s 2027 sample plan fields are loaded${videoSampleEdited ? ' and one or more have been edited' : ''}. Verify them against your benefits documents.`
      : `The video’s self-only sample values remain in the plan fields${videoSampleEdited ? ' (one or more have been edited)' : ''}. Changing coverage choice does not update them; replace them with the selected tier’s terms before comparing.`;
    status.hidden = false;
  } else {
    status.textContent = '';
    status.hidden = true;
  }
}

function loadVideoPlanSample() {
  if (value('tier') !== 'employee_only') {
    updateVideoSampleState('Choose “Just me” to load this single-person sample. Coverage selection and plan values were not changed.');
    return;
  }
  for (const key of ['A', 'B']) {
    for (const field of ['monthly', 'deductible', 'coinsurance', 'maximum']) {
      setValue(`${key}-${field}`, VIDEO_PLAN_SAMPLE[key][field]);
    }
  }
  setValue('B-employer', VIDEO_PLAN_SAMPLE.B.employer);
  videoSampleLoaded = true;
  videoSampleEdited = false;
  if (exampleMode) { exampleMode = false; $('example-status').hidden = true; }
  updateVideoSampleState();
  if (hasCalculated) calculatePlan(false);
}

function loadFictionalExample() {
  exampleMode = true;
  videoSampleLoaded = false;
  videoSampleEdited = false;
  updateVideoSampleState();
  setCareScenarioSelection();
  $('example-status').hidden = false;
  setValue('tier', 'employee_only'); updateVideoSampleState(); setValue('network', 'in'); setValue('allowed', '5000');
  setValue('A-monthly', '250'); setValue('A-deductible', '1500'); setValue('A-coinsurance', '20'); setValue('A-maximum', '5000');
  setValue('B-monthly', '150'); setValue('B-deductible', '3000'); setValue('B-coinsurance', '20'); setValue('B-maximum', '6000'); setValue('B-employer', '1000');
  $('eligible').checked = true; setValue('payrollEmployee', '0'); setValue('directEmployee', '0'); setValue('starting', '0'); setValue('catchUp', '0');
  $('catchUpEligible').checked = false; $('taxEnabled').checked = false;
  setValue('federal', ''); setValue('state', ''); setValue('payroll', '');
  $('billEnabled').checked = false; setValue('billDate', ''); setValue('bill', ''); setValue('bill-qualified', ''); setValue('bill-planned', ''); setValue('bill-available', ''); setValue('bill-outsideCash', '');
  setValue('growth-starting', '0'); setValue('growth-contribution', '1000'); setValue('growth-returnRate', '5');
  setGrowthReturnSelection('growth-return-5');
  setValue('growth-fundExpenseRate', '0.05'); setValue('growth-adminRate', '0'); setValue('growth-adminCap', '0');
  $('growth-adminUncapped').checked = false; setValue('growth-adminFlatFee', '0'); $('growth-adminCap').disabled = false;
  $('hsa-details').open = true; $('bill-details').open = false; $('growth-details').open = true;
  $('hsa-fields').hidden = false; $('tax-option').hidden = false; $('tax-fields').hidden = true; $('bill-fields').hidden = true;
  form.requestSubmit();
  projectGrowth(false);
}

form.addEventListener('submit', event => { event.preventDefault(); calculatePlan(true); });

$('try-example').addEventListener('click', loadFictionalExample);
$('load-video-plan-sample').addEventListener('click', loadVideoPlanSample);
for (const id of ['care-scenario-light', 'care-scenario-medium', 'care-scenario-high']) {
  $(id).addEventListener('click', () => {
    setValue('allowed', $(id).getAttribute('data-care-scenario'));
    setCareScenarioSelection(id);
    if (exampleMode) { exampleMode = false; $('example-status').hidden = true; }
    if (hasCalculated) calculatePlan(false);
  });
}
for (const id of ['growth-return-5', 'growth-return-7', 'growth-return-10']) {
  $(id).addEventListener('click', () => {
    setValue('growth-returnRate', $(id).getAttribute('data-growth-return-rate'));
    setGrowthReturnSelection(id);
    if (hasProjected) projectGrowth(false);
  });
}
$('walkthrough-play').addEventListener('click', () => {
  const button = $('walkthrough-play');
  const player = $('walkthrough-player');
  if (player.children.length) return;
  const videoId = button.getAttribute('data-video-id');
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return;
  const title = button.getAttribute('data-video-title') || 'YouTube video';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', `${title} video player`);
  iframe.setAttribute('src', `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`);
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
  iframe.setAttribute('allowfullscreen', '');
  player.replaceChildren(iframe);
  button.hidden = true;
  iframe.focus();
});
$('eligible').addEventListener('change', () => {
  $('hsa-fields').hidden = !$('eligible').checked;
  $('tax-option').hidden = !$('eligible').checked;
  if (!$('eligible').checked) { $('taxEnabled').checked = false; $('tax-fields').hidden = true; }
});
$('taxEnabled').addEventListener('change', () => { $('tax-fields').hidden = !$('taxEnabled').checked; });
$('billEnabled').addEventListener('change', () => { $('bill-fields').hidden = !$('billEnabled').checked; });
$('growth-adminUncapped').addEventListener('change', () => {
  $('growth-adminCap').disabled = $('growth-adminUncapped').checked;
  if (hasProjected) projectGrowth(false);
});
$('project-growth').addEventListener('click', () => projectGrowth(true));
form.addEventListener('input', event => {
  if (exampleMode) { exampleMode = false; $('example-status').hidden = true; }
  if (videoSampleLoaded && ['A-monthly', 'A-deductible', 'A-coinsurance', 'A-maximum', 'B-monthly', 'B-deductible', 'B-coinsurance', 'B-maximum', 'B-employer'].includes(event.target.id)) {
    videoSampleEdited = true;
    updateVideoSampleState();
  }
  if (event.target.id === 'tier') updateVideoSampleState();
  if (event.target.id === 'allowed') setCareScenarioSelection();
  if (event.target.id === 'growth-returnRate') setGrowthReturnSelection();
  if (hasCalculated) calculatePlan(false);
  if (hasProjected && event.target.id?.startsWith('growth-')) projectGrowth(false);
});
form.addEventListener('change', event => {
  if (exampleMode) { exampleMode = false; $('example-status').hidden = true; }
  if (videoSampleLoaded && ['A-monthly', 'A-deductible', 'A-coinsurance', 'A-maximum', 'B-monthly', 'B-deductible', 'B-coinsurance', 'B-maximum', 'B-employer'].includes(event.target.id)) {
    videoSampleEdited = true;
    updateVideoSampleState();
  }
  if (event.target.id === 'tier') updateVideoSampleState();
  if (event.target.id === 'allowed') setCareScenarioSelection();
  if (event.target.id === 'growth-returnRate') setGrowthReturnSelection();
  if (hasCalculated) calculatePlan(false);
  if (hasProjected && event.target.id?.startsWith('growth-')) projectGrowth(false);
});
$('result-heading').tabIndex = -1;
form.addEventListener('reset', () => {
  exampleMode = false; hasProjected = false; hasCalculated = false;
  videoSampleLoaded = false; videoSampleEdited = false;
  setCareScenarioSelection();
  setGrowthReturnSelection();
  $('example-status').hidden = true;
  $('result-output').hidden = true; $('result-empty').hidden = false; $('bill-result').hidden = true;
  $('growth-result').hidden = true; $('growth-errors').hidden = true;
  clearErrors();
  $('hsa-details').open = false; $('bill-details').open = false; $('growth-details').open = false;
  setTimeout(() => {
    const eligible = $('eligible').checked;
    $('hsa-fields').hidden = !eligible;
    $('tax-option').hidden = !eligible;
    $('tax-fields').hidden = !eligible || !$('taxEnabled').checked;
    $('bill-fields').hidden = !$('billEnabled').checked;
    $('growth-adminCap').disabled = $('growth-adminUncapped').checked;
    updateVideoSampleState();
  }, 0);
});
updateVideoSampleState();
