export const normPhone = (p: string) => p.replace(/[\s-]/g, '')
export const normEmail = (e: string) => e.trim().toLowerCase()
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
