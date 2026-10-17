(() => {
  const openButton = document.querySelector('[data-chat-open]');
  const dialog = document.querySelector('[data-chat-dialog]');
  if (!openButton || !dialog || typeof dialog.showModal !== 'function') return;
  const closeButton = dialog.querySelector('[data-chat-close]');
  const context = dialog.querySelector('[data-chat-context]');
  let returnFocus = null;
  function close() { if (dialog.open) dialog.close(); }
  openButton.addEventListener('click', () => {
    returnFocus = document.activeElement;
    context.textContent = document.body.dataset.pageLabel || 'Paul On Money';
    dialog.showModal();
    closeButton.focus();
  });
  closeButton.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', () => {
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
  });
})();

