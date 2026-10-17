import { comparePlans, assessEarlyBill } from './calculator-core.mjs';

const $ = id => document.getElementById(id);
const form = $('calculator');
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
const value = id => $(id).value;
const num = id => value(id) === '' ? '0' : value(id);
const rate = id => value(id) === '' ? '0' : String(Number(value(id)) / 100);

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

function showErrors(errors) {
  const box = $('errors');
  box.replaceChildren();
  if (!errors.length) { box.hidden = true; return; }
  const title = document.createElement('h3'); title.textContent = 'Check these entries'; box.append(title);
  const list = document.createElement('ul');
  for (const error of errors) { const item = document.createElement('li'); item.textContent = error.message; list.append(item); }
  box.append(list); box.hidden = false; box.focus();
}

function displayResult(result, bill) {
  $('result-empty').hidden = true; $('result-output').hidden = false;
  const relation = result.relation === 'tie'
    ? 'The estimated costs are about the same with the amounts entered.'
    : `Plan ${result.relation} has the lower estimated yearly cost by about ${money(Math.abs(result.difference))}.`;
  $('comparison').textContent = relation + ' This is an estimate, not an enrollment recommendation.';
  $('cost-A').textContent = money(result.A.economicCost);
  $('cost-B').textContent = money(result.B.economicCost);
  const premium = result.premiumDifference;
  $('premium-difference').textContent = premium.monthly === 0
    ? 'The monthly premiums are the same.'
    : `Plan ${premium.planBLower ? 'B' : 'A'} has a lower monthly premium by ${money(Math.abs(premium.monthly))} (${money(Math.abs(premium.annual))} over 12 months). A lower premium does not guarantee a lower total cost.`;
  const first = result.firstYearPlan;
  $('hsa-summary').textContent = result.hsaAssessed
    ? `After the planned deposits arrive, the HSA would have about ${money(first.totalAfterDeposits)}. Plan B's entered out-of-pocket maximum is ${money(first.coveredCostLimit)}. The HSA limit and timing of deposits still apply.`
    : 'HSA deposits, payments, balances, and your own HSA tax savings are not included until you confirm that you can contribute for all of 2027. Check whether you would receive the employer contribution entered.';
  $('tax-summary').textContent = result.taxEnabled
    ? `Estimated tax savings on your own deposits: about ${money(result.B.taxBenefit)}. This limited estimate uses the rates entered and may differ from your actual tax treatment.`
    : 'No estimated tax savings are included.';
  $('warning').textContent = result.warnings.join(' ');
  if (bill) {
    const date = value('billDate');
    $('bill-result').hidden = false;
    $('bill-summary').textContent = bill.funded
      ? `The entered money could cover this bill due ${date}. About ${money(bill.endingHSA)} of the entered HSA amount would remain after the planned payment.`
      : `The entered money is short by about ${money(bill.shortfall)} for this bill due ${date}. Money planned to arrive later is not counted.`;
  } else $('bill-result').hidden = true;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  $('result-output').hidden = true; $('result-empty').hidden = false; $('bill-result').hidden = true;
  const result = comparePlans(inputData());
  showErrors(result.errors);
  if (!result.ready) return;
  let bill = null;
  if ($('billEnabled').checked) {
    bill = assessEarlyBill({ mode: 'assess', date: value('billDate'), bill: value('bill'), qualified: value('bill-qualified'), planned: value('bill-planned'), available: value('bill-available'), outsideCash: value('bill-outsideCash') });
    if (!bill.ready) { showErrors(bill.errors); return; }
  }
  showErrors([]);
  displayResult(result, bill);
  $('result-heading').focus();
});
$('eligible').addEventListener('change', () => {
  $('hsa-fields').hidden = !$('eligible').checked;
  $('tax-option').hidden = !$('eligible').checked;
  if (!$('eligible').checked) { $('taxEnabled').checked = false; $('tax-fields').hidden = true; }
});
$('taxEnabled').addEventListener('change', () => { $('tax-fields').hidden = !$('taxEnabled').checked; });
$('billEnabled').addEventListener('change', () => { $('bill-fields').hidden = !$('billEnabled').checked; });
$('result-heading').tabIndex = -1;
form.addEventListener('reset', () => {
  $('result-output').hidden = true; $('result-empty').hidden = false; $('bill-result').hidden = true;
  showErrors([]);
  $('hsa-details').open = false; $('bill-details').open = false;
  setTimeout(() => {
    const eligible = $('eligible').checked;
    $('hsa-fields').hidden = !eligible;
    $('tax-option').hidden = !eligible;
    $('tax-fields').hidden = !eligible || !$('taxEnabled').checked;
    $('bill-fields').hidden = !$('billEnabled').checked;
  }, 0);
});
