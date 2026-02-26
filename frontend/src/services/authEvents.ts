import useAuthStore from '../store/authStore'

export function onUnauthorized() {
  const { logout } = useAuthStore.getState()
  logout()

  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}
