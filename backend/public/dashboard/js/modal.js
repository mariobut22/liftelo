function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.dataset.modalOpen = 'true';
  document.body.classList.add('overflow-hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.dataset.modalOpen = 'false';
  document.body.classList.remove('overflow-hidden');
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (window.innerWidth < 768) return;
  document.querySelectorAll('[data-modal-open="true"]').forEach((modal) => {
    closeModal(modal.id);
  });
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-modal-overlay="true"]');
  if (!target) return;
  if (window.innerWidth < 768) return;
  const modalId = target.getAttribute('data-modal-id');
  if (modalId) {
    closeModal(modalId);
  }
});

document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-modal-target]');
  if (!trigger) return;
  event.preventDefault();
  const modalId = trigger.getAttribute('data-modal-target');
  if (modalId) {
    openModal(modalId);
  }
});

window.openModal = openModal;
window.closeModal = closeModal;
