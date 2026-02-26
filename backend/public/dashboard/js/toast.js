function showToast(message, variant = 'success') {
  const existing = document.getElementById('tw-toast');
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'tw-toast';

  const baseClasses = 'fixed top-6 right-6 z-[2000] flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg';
  const variants = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900'
  };

  toast.className = `${baseClasses} ${variants[variant] || variants.success}`;
  toast.innerHTML = `
    <span class="font-semibold">${variant === 'error' ? 'Greška' : 'Uspjeh'}</span>
    <span class="opacity-80">${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('opacity-0');
    toast.style.transition = 'opacity 300ms ease';
  }, 2600);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}
