export const API_URL = `http://${window.location.hostname}:8003`

export const safeFetch = async (url, options = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout ?? 3000)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)
    return res
  } catch (error) {
    clearTimeout(timeout)
    throw error
  }
}
