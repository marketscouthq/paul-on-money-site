(() => {
  const input = document.getElementById('question-input');
  const button = document.getElementById('find-path');
  const feedback = document.getElementById('question-feedback');
  if (!input || !button || !feedback) return;
  function findPath() {
    const question = input.value.trim();
    feedback.hidden = false;
    if (!question) {
      feedback.textContent = 'Type a question or open the work health-plan comparison below.';
      input.focus();
      return;
    }
    if (/health|plan|hsa|ppo|deductible|benefit|insurance/i.test(question)) {
      // Use the query only in memory to choose a path; do not add it to the URL or store it.
      window.location.href = '/tools/health-plan-comparison/';
      return;
    }
    feedback.textContent = 'No published answer matches this question yet. Try the free health-plan tool or check back as public answers are added.';
  }
  button.addEventListener('click', findPath);
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); findPath(); } });
})();

