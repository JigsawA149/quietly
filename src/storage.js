const PREFIX = 'quietly_v2_'


/** Read JSON without destroying malformed data. */
export function readStored(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw === null) return { value: fallback, source: 'default' }
    return { value: JSON.parse(raw), source: 'storage' }
  } catch (error) {
    console.warn(`[QUIETLY] Could not read ${key}:`, error)
    return { value: fallback, source: 'error', error }
  }
}


/** Writes are explicit and namespaced; storage errors are surfaced to callers. */
export function writeStored(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return { ok: true }
  } catch (error) {
    console.error(`[QUIETLY] Could not save ${key}:`, error)
    return { ok: false, error }
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(PREFIX + key)
    return { ok: true }
  } catch (error) {
    console.error(`[QUIETLY] Could not remove ${key}:`, error)
    return { ok: false, error }
  }
}

export function storageStatus() {
  try {
    const probe = PREFIX + '__probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return { available: true }
  } catch (error) {
    return { available: false, error }
  }
}
