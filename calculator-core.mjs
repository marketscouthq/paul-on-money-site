// Derived from website-tools/health-plan-comparison/calculator-core.mjs. Do not hand-edit this generated output.

export const PLAN_YEAR = 2027;

export const TIERS = ['employee_only', 'spouse', 'children', 'family'];

export const NETWORKS = ['in', 'out'];

export function numberOrUnknown(value) {
  if (!['number', 'string'].includes(typeof value) ||
      (typeof value === 'string' && value.trim() === '')) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function contributionRoom(tier, employer, catchUp = 0) {
  return (tier === 'employee_only' ? 4500 : 9000) - employer + catchUp;
}

export function patientResponsibility({ allowed, deductible, coinsurance, maximum, other = 0, noncovered = 0 }) {
  const deductiblePortion = Math.min(allowed, deductible);
  const coinsurancePortion = Math.max(0, allowed - deductiblePortion) * coinsurance;
  const coveredPatient = Math.min(maximum, deductiblePortion + coinsurancePortion + other);
  return { deductiblePortion, coinsurancePortion, coveredPatient, patient: coveredPatient + noncovered };
}

export function annualPlan(plan, { employee = 0, starting = 0, taxBenefit = 0 } = {}) {
  const care = patientResponsibility(plan);
  const premium = plan.monthly * 12;
  const availableHSA = starting + plan.employer + employee;
  const qualifiedCap = Math.min(plan.qualified === 'derive' ? care.patient : plan.qualified, care.patient);
  const hsaPayment = Math.min(availableHSA, qualifiedCap);
  const outside = care.patient - hsaPayment;
  const retained = availableHSA - hsaPayment;
  const cashCommitted = premium + employee + outside;
  const economicCost = premium + care.patient - plan.employer - taxBenefit;
  const netHSAChange = retained - starting;
  const reconciliation = cashCommitted - netHSAChange - taxBenefit - economicCost;
  return { ...care, premium, employer: plan.employer, employee, starting, taxBenefit,
    availableHSA, qualifiedCap, hsaPayment, outside, retained, cashCommitted,
    economicCost, netHSAChange, reconciliation };
}

export function comparePlans(input = {}) {
  const errors = [];
  const read = (value, field, label, max = Infinity) => {
    const n = numberOrUnknown(value);
    if (n === null || n < 0 || n > max) errors.push({ field, message: `${label}: enter ${max === 1 ? 'a percentage from 0 to 100' : max < Infinity ? `a number from 0 to ${max}` : 'a number of 0 or more'}. Enter 0 when there is none; a blank cannot be calculated.` });
    return n;
  };
  if (!TIERS.includes(input.tier)) errors.push({ field: 'tier', message: 'Choose who needs coverage.' });
  if (!NETWORKS.includes(input.network)) errors.push({ field: 'network', message: 'Choose where you will get most of your care.' });
  const warnings = ['Before choosing, check your full premiums, rules for visits and prescriptions, employer HSA deposits, which expenses meet IRS rules, and whether you can contribute to an HSA.'];
  if (input.tier !== 'employee_only') warnings.push('For family coverage, this estimate treats the family as one total. Your plan may track each person separately or start paying for one person before the family reaches its deductible. Check those rules before using this estimate.');
  const hsa = input.hsa || {};
  const hsaAssessed = hsa.eligible === true;
  if (!hsaAssessed) warnings.push('You have not confirmed that you can contribute to an HSA all year. HSA payments, balances and cash paid or saved are not calculated, and tax savings on your deposits are left out. The yearly cost still uses the employer HSA deposit entered; check that you would receive it.');
  const payrollEmployee = hsaAssessed ? read(hsa.payrollEmployee, 'payrollEmployee', 'Your paycheck HSA deposits for the year') : 0;
  const directEmployee = hsaAssessed ? read(hsa.directEmployee, 'directEmployee', 'Extra HSA money you transfer yourself for the year') : 0;
  const employee = payrollEmployee + directEmployee;
  const starting = hsaAssessed ? read(hsa.starting, 'starting', 'HSA money available at the start of the year') : 0;
  const catchUp = hsaAssessed ? read(hsa.catchUp, 'catchUp', 'Extra HSA contribution limit at age 55 or older', 1000) : 0;
  if (catchUp > 0 && hsa.catchUpEligible !== true) errors.push({ field: 'catchUpEligible', message: 'Confirm that you qualify for the extra HSA contribution allowed at age 55 or older.' });
  let taxBenefit = 0;
  let payrollComparison = null;
  if (hsa.taxEnabled === true && hsaAssessed) {
    const federal = read(hsa.federal, 'federal', 'Federal income tax rate', 1);
    const state = read(hsa.state, 'state', 'State income tax rate saved with an HSA', 1);
    const payroll = payrollEmployee > 0 ? read(hsa.payroll, 'payroll', 'Payroll tax rate saved with an HSA', 1) : 0;
    if (federal + state + payroll > 1) errors.push({ field: 'federal', message: 'Combined estimated tax rates cannot exceed 100%.' });
    taxBenefit = payrollEmployee * (federal + state + payroll) + directEmployee * (federal + state);
    if (payrollEmployee > 0 && directEmployee > 0) {
      payrollComparison = { employeeTotal: employee, payrollEmployee, directEmployee,
        currentMixBenefit: taxBenefit, allPayrollBenefit: employee * (federal + state + payroll),
        additionalBenefit: directEmployee * payroll };
    }
  }
  const allowed = input.advanced ? null : read(input.allowed, 'allowed', "Total price of this year's covered care");
  const plans = {};
  for (const key of ['A', 'B']) {
    const p = input.plans?.[key] || {};
    plans[key] = {};
    for (const [field, label] of Object.entries({ monthly: 'monthly premium', deductible: 'deductible',
      coinsurance: 'coinsurance percentage', maximum: 'out-of-pocket maximum', employer: 'employer money added to HSA' })) {
      plans[key][field] = read(p[field], `${key}-${field}`, `Plan ${key} ${label}`, field === 'coinsurance' ? 1 : Infinity);
    }
    if (key === 'A' && plans[key].employer !== 0) errors.push({ field: 'A-employer', message: 'Plan A is the PPO in this calculator, so employer money added to an HSA must be $0.' });
    if (plans[key].maximum < plans[key].deductible) errors.push({ field: `${key}-maximum`, message: `Plan ${key}: the out-of-pocket maximum must be at least the deductible for this simple estimate.` });
    if (input.advanced) {
      for (const [field, label] of Object.entries({ allowed: 'total price of covered care', other: 'extra payments that count toward the yearly limit', noncovered: 'bills that do not count toward the yearly limit', qualified: 'your care costs that can be paid from an HSA' })) plans[key][field] = read(p[field], `${key}-${field}`, `Plan ${key} ${label}`);
    } else Object.assign(plans[key], { allowed, other: 0, noncovered: 0, qualified: 'derive' });
  }
  const room = contributionRoom(input.tier, plans.B.employer, catchUp);
  if (room < 0 || employee > room) errors.push({ field: 'directEmployee', message: `Your deposits plus your employer's exceed the 2027 HSA limit. With the employer amount entered, you can add no more than $${Math.max(0, room).toFixed(2)} of your own money.` });
  if (errors.length) return { ready: false, errors };
  const A = annualPlan(plans.A);
  const B = annualPlan(plans.B, { employee, starting, taxBenefit });
  if (Object.values(A).some(v => !Number.isFinite(v)) || Object.values(B).some(v => !Number.isFinite(v))) {
    return { ready: false, errors: [{ field: 'allowed', message: 'These amounts are too large to calculate. Enter realistic yearly amounts.' }] };
  }
  if (!hsaAssessed) {
    for (const plan of [A, B]) for (const field of ['availableHSA', 'qualifiedCap', 'hsaPayment', 'outside', 'retained', 'cashCommitted', 'netHSAChange', 'reconciliation']) plan[field] = null;
  }
  const difference = B.economicCost - A.economicCost;
  const monthlyDifference = plans.A.monthly - plans.B.monthly;
  const premiumDifference = { monthly: monthlyDifference, annual: monthlyDifference * 12,
    planBLower: monthlyDifference > 0 };
  const firstYearPlan = hsaAssessed ? (() => {
    const totalAfterDeposits = starting + plans.B.employer + payrollEmployee + directEmployee;
    const coveredCostLimit = plans.B.maximum;
    const gapToLimit = Math.max(0, coveredCostLimit - totalAfterDeposits);
    const contributionRoomLeft = Math.max(0, room - employee);
    const additionalHsaPossible = Math.min(gapToLimit, contributionRoomLeft);
    return { employerDeposit: plans.B.employer, payrollEmployee, directEmployee, startingBalance: starting,
      totalAfterDeposits, coveredCostLimit, gapToLimit, contributionRoomLeft, additionalHsaPossible,
      outsideTarget: Math.max(0, gapToLimit - additionalHsaPossible),
      leftAfterLimit: Math.max(0, totalAfterDeposits - coveredCostLimit) };
  })() : null;
  return { ready: true, errors: [], A, B, difference, relation: Math.abs(difference) < .005 ? 'tie' : difference < 0 ? 'B' : 'A',
    room, hsaAssessed, warnings, taxEnabled: hsa.taxEnabled === true && hsaAssessed, firstYearPlan, premiumDifference, payrollComparison,
    drivers: { premiums: B.premium - A.premium, patient: B.patient - A.patient,
      employer: -(B.employer - A.employer), tax: -taxBenefit } };
}

export function assessEarlyBill(input = {}) {
  if (input.mode === 'none') return { ready: true, assessed: false, errors: [] };
  const errors = [];
  if (input.mode !== 'assess') errors.push({ field: 'billMode', message: 'Choose Skip this check or Check one bill.' });
  const date = input.date;
  const parsed = typeof date === 'string' && /^2027-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) errors.push({ field: 'billDate', message: 'Enter a real bill due date in 2027.' });
  const values = {};
  for (const [field, label] of Object.entries({ bill: 'Amount you would owe under Plan B', qualified: 'Amount of this bill that can be paid from an HSA', planned: 'Amount you plan to pay from the HSA', available: 'HSA money you could use by the due date', outsideCash: 'Other savings you could use by the due date' })) {
    values[field] = numberOrUnknown(input[field]);
    if (values[field] === null || values[field] < 0) errors.push({ field: `bill-${field}`, message: `${label}: enter 0 or more. Enter 0 when there is none; a blank cannot be calculated.` });
  }
  if (values.qualified > values.bill) errors.push({ field: 'bill-qualified', message: 'The amount that can be paid from an HSA cannot be more than the total bill you owe.' });
  if (errors.length) return { ready: false, assessed: false, errors };
  const hsaPayment = Math.min(values.bill, values.planned, values.qualified, values.available);
  const outside = values.bill - hsaPayment;
  const endingHSA = values.available - hsaPayment;
  const missing = outside - values.outsideCash;
  // Normalize only arithmetic residue at the payment sufficiency boundary.
  // This preserves genuine gaps, including one cent, without rounding inputs.
  const arithmeticTolerance = Number.EPSILON * Math.max(1, values.bill, values.outsideCash) * 4;
  const shortfall = missing > arithmeticTolerance ? missing : 0;
  return { ready: true, assessed: true, errors: [], hsaPayment, outside, endingHSA,
    cushionAvailable: values.outsideCash, cushionUsed: Math.min(outside, values.outsideCash),
    shortfall, funded: shortfall === 0 };
}

