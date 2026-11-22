import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { readStored, writeStored } from './storage.js'
import { I18nContext, LANGUAGES, detectLanguage, makeT, useI18n } from './i18n.js'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/500.css'
import './styles.css'

function greetingKey(hour) {
  if (hour < 12) return 'greeting.morning'
  if (hour < 17) return 'greeting.afternoon'
  return 'greeting.evening'
}


function localDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}


function Clock({ tasks = [], habits = [], today }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const { t, locale, hour12 } = useI18n()
  const minuteText = String(now.getMinutes()).padStart(2, '0')
  const clockText = hour12 ? `${now.getHours() % 12 || 12}:${minuteText}` : `${String(now.getHours()).padStart(2, '0')}:${minuteText}`
  const period = hour12 ? t(now.getHours() >= 12 ? 'time.pm' : 'time.am') : ''
  const left = tasks.filter(task => !task.completed).length
  const habitsDone = habits.filter(habit => habit.completedDate === today).length
  const bits = []
  if (tasks.length) bits.push(left === 0 ? t('glance.allDone') : t(left === 1 ? 'glance.taskLeft' : 'glance.tasksLeft', { n: left }))
  if (habits.length) bits.push(t('glance.habits', { done: habitsDone, total: habits.length }))
  const glance = bits.join(' · ')
  return <section className="hero-clock panel">
    <h1>{t(greetingKey(now.getHours()))}</h1>
    <div className="time">{clockText}<span className="time-period">{period}</span></div>
    <div className="date">{now.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>
    {glance && <div className="glance">{glance}</div>}
  </section>
}



function PomodoroDialog({ onClose, autoStart = false }) {
  const { t } = useI18n()
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])
  const modes = { focus: { label: t('pomo.focus') }, short: { label: t('pomo.short') }, long: { label: t('pomo.long') } }
  const [mode, setMode] = useState('focus')
  const [durations, setDurations] = useState(() => { const saved = readStored('pomodoro-durations', null).value; return saved && typeof saved === 'object' ? { focus: saved.focus || 25, short: saved.short || 5, long: saved.long || 15 } : { focus: 25, short: 5, long: 15 } })
  const [remaining, setRemaining] = useState(durations.focus * 60)
  const [running, setRunning] = useState(autoStart)
  const [sessions, setSessions] = useState(() => readStored('pomodoro-sessions', 0).value || 0)
  const [notificationStatus, setNotificationStatus] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))
  const endAt = useRef(null)
  const remainingRef = useRef(remaining)
  useEffect(() => { remainingRef.current = remaining }, [remaining])
  const switchMode = key => { setRunning(false); endAt.current = null; setMode(key); const next = durations[key] * 60; setRemaining(next); remainingRef.current = next }
  const reset = () => { setRunning(false); endAt.current = null; const next = durations[mode] * 60; setRemaining(next); remainingRef.current = next }
  const adjust = delta => { if (running) return; const nextDurations = { ...durations, [mode]: Math.max(1, Math.min(120, durations[mode] + delta)) }; setDurations(nextDurations); writeStored('pomodoro-durations', nextDurations); const next = nextDurations[mode] * 60; setRemaining(next); remainingRef.current = next }
  useEffect(() => { if (!running) return; endAt.current = Date.now() + remainingRef.current * 1000; const tick = () => { const next = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)); setRemaining(next); remainingRef.current = next; if (next <= 0) { setRunning(false); endAt.current = null; if (mode === 'focus') { const updated = sessions + 1; setSessions(updated); writeStored('pomodoro-sessions', updated) } if ('Notification' in window && Notification.permission === 'granted') { try { const notice = new Notification('QUIETLY', { body: mode === 'focus' ? tRef.current('pomo.doneFocus') : tRef.current('pomo.doneBreak'), tag: 'quietly-pomodoro', requireInteraction: false }); notice.onclick = () => { window.focus(); notice.close(); }; } catch (error) { console.warn('QUIETLY notification could not be shown:', error); } } } }; tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer) }, [running, mode, sessions])
  const start = () => { if (remaining <= 0) reset(); setRunning(true) }
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')
  const total = durations[mode] * 60
  const progress = total ? (total - remaining) / total : 0
  const enableNotifications = async () => { if (!('Notification' in window)) { setNotificationStatus('unsupported'); return } if (Notification.permission === 'default') { const permission = await Notification.requestPermission(); setNotificationStatus(permission); return } setNotificationStatus(Notification.permission) }
  return <div className="dialog-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="dialog pomodoro-dialog" role="dialog" aria-modal="true" aria-label={t('pomo.aria')}>
      <div className="dialog-topline"><div className="panel-label">{t('pomo.label')}</div><button type="button" className="dialog-close" onClick={onClose} aria-label={t('pomo.close')}>×</button></div>
      <div className="pomodoro-modes">{Object.keys(modes).map(key => <button type="button" key={key} className={`pomodoro-mode ${mode === key ? 'active' : ''}`} onClick={() => switchMode(key)}>{modes[key].label}</button>)}</div>
      <div className="pomodoro-clock"><span>{mm}:{ss}</span><div className="pomodoro-track"><div style={{ width: `${progress * 100}%` }} /></div></div>
      <div className="pomodoro-adjust"><button type="button" onClick={() => adjust(-1)} disabled={running}>−</button><span>{t('pomo.minutes', { n: durations[mode] })}</span><button type="button" onClick={() => adjust(1)} disabled={running}>+</button></div>
      <div className="pomodoro-controls"><button type="button" className="pomodoro-primary" onClick={() => running ? setRunning(false) : start()}>{running ? t('pomo.pause') : remaining < total ? t('pomo.resume') : t('pomo.start')}</button><button type="button" className="pomodoro-secondary" onClick={reset}>{t('pomo.reset')}</button></div>
      <div className="pomodoro-session-count">{t(sessions === 1 ? 'pomo.session' : 'pomo.sessions', { n: sessions })}</div>
      <button type="button" className="pomodoro-notification" onClick={enableNotifications}>{notificationStatus === 'granted' ? t('pomo.notifOn') : notificationStatus === 'denied' ? t('pomo.notifBlocked') : notificationStatus === 'unsupported' ? t('pomo.notifUnsupported') : t('pomo.notifEnable')}</button>
    </section>
  </div>
}

function FocusPanel({ onOpen }) {
  const { t } = useI18n()
  const saved = readStored('pomodoro-durations', null).value
  const minutes = saved && typeof saved === 'object' && saved.focus ? saved.focus : 25
  return <button type="button" className="panel focus focus-button" onClick={onOpen} aria-label={t('focus.aria', { n: minutes })}>
    <div className="panel-label">{t('focus.label')}</div>
    <h2>{t('focus.title')}</h2>
    <div className="focus-row"><span className="focus-time">{String(minutes).padStart(2, '0')}:00</span><span className="focus-start">{t('focus.start')}</span></div>
  </button>
}

function QuoteOfTheDay({ compact = false } = {}) {
  const { t } = useI18n()
  const DAILY_QUOTES = t('quotes')
  const dayNumber = Math.floor(new Date().setHours(0,0,0,0) / 86400000)
  const [offset, setOffset] = useState(() => { const saved = readStored('quote-offset', null).value; return saved && saved.day === dayNumber && Number.isInteger(saved.offset) ? saved.offset : 0 })
  const quote = DAILY_QUOTES[(dayNumber + offset) % DAILY_QUOTES.length]
  const nextThought = () => { const next = (offset + 1) % DAILY_QUOTES.length; setOffset(next); writeStored('quote-offset', { day: dayNumber, offset: next }) }
  return <section className={`panel quote-card ${compact ? 'quote-compact' : ''}`}>
    <div className="panel-label quote-label">{t('quote.label')}</div>
    <div className="quote-mark" aria-hidden="true">“</div>
    <h2>{quote}</h2>
    <button type="button" className="quote-action" onClick={nextThought}>{t('quote.another')}</button>
  </section>
}


const THEMES = [
  { id: 'forest', colors: ['#18372b','#2d4938','#bda26a','#e8dfc9'] },
  { id: 'paper', colors: ['#ede5d5','#dcd0bb','#9b8060','#514436'] },
  { id: 'midnight', colors: ['#202b3d','#2d3d55','#829cc4','#e0e7f0'] },
  { id: 'rose', colors: ['#392b35','#503d4b','#b58fa3','#f0dfe8'] },
  { id: 'sage', colors: ['#28342e','#3e5146','#9fb5a1','#e2e9dc'] },
  { id: 'amber', colors: ['#362c21','#51402e','#c39b62','#f0e1c5'] },
  { id: 'lavender', colors: ['#302c3e','#49435d','#b5a8d0','#eee7f4'] },
  { id: 'coastal', colors: ['#25343a','#3c535c','#8eb7c3','#e0ebee'] },
  { id: 'auto', colors: ['#29352f','#405249','#a6b7a5','#e5e8dc'] },
]

function ThemeDialog({ currentTheme, onSelect, onClose }) {
  const { t } = useI18n()
  useEffect(() => {
    const handler = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="tasks-dialog theme-dialog" role="dialog" aria-modal="true" aria-labelledby="theme-dialog-title">
      <div className="dialog-topline"><div className="panel-label">{t('theme.label')}</div><button type="button" className="dialog-close" onClick={onClose} aria-label={t('theme.close')}>×</button></div>
      <h2 id="theme-dialog-title">{t('theme.title')}</h2><p className="dialog-description">{t('theme.desc')}</p>
      <div className="theme-options">{THEMES.map(theme => <button type="button" key={theme.id} className={`theme-option ${currentTheme === theme.id ? 'selected' : ''}`} onClick={() => onSelect(theme.id)} aria-pressed={currentTheme === theme.id}>
        <span className="theme-swatches">{theme.colors.map((color, index) => <span key={index} style={{ backgroundColor: color }} />)}</span>
        <span className="theme-option-name">{t(`theme.${theme.id}.name`)}</span><span className="theme-option-mood">{t(`theme.${theme.id}.mood`)}</span>{currentTheme === theme.id && <span className="theme-selected">{t('theme.active')}</span>}
      </button>)}</div>
      <div className="tasks-dialog-footer"><span>{t('theme.saved')}</span><button type="button" className="close-dialog-button" onClick={onClose}>{t('dialog.done')}</button></div>
    </section>
  </div>
}

const BACKGROUNDS = [
  { id: 'none', category: 'minimal', image: '' },
  { id: 'hemlock-path', category: 'forest', image: '/backgrounds/hemlock-path.jpg' },
  { id: 'mossy-stream', category: 'forest', image: '/backgrounds/mossy-stream.jpg' },
  { id: 'candlelit-window', category: 'cozy', image: '/backgrounds/candlelit-window.jpg' },
  { id: 'reading-corner', category: 'cozy', image: '/backgrounds/reading-corner.jpg' },
  { id: 'window-nook', category: 'cozy', image: '/backgrounds/window-nook.jpg' },
  { id: 'rainy-evening', category: 'rain', image: '/backgrounds/rainy-evening.jpg' },
  { id: 'teal-fog', category: 'rain', image: '/backgrounds/teal-fog.jpg' },
  { id: 'loch-dusk', category: 'moody', image: '/backgrounds/loch-dusk.jpg' },
  { id: 'skye-cottage', category: 'highlands', image: '/backgrounds/skye-cottage.jpg' },
  { id: 'golden-loch', category: 'highlands', image: '/backgrounds/golden-loch.jpg' },
  { id: 'snowfall-forest', category: 'winter', image: '/backgrounds/snowfall-forest.jpg' },
  { id: 'snowy-path', category: 'winter', image: '/backgrounds/snowy-path.jpg' },
  { id: 'fireside-christmas', category: 'christmas', image: '/backgrounds/fireside-christmas.jpg' },
  { id: 'gothic-christmas', category: 'christmas', image: '/backgrounds/gothic-christmas.jpg' },
  { id: 'long-library', category: 'academia', image: '/backgrounds/long-library.jpg' },
  { id: 'arched-window-study', category: 'academia', image: '/backgrounds/arched-window-study.jpg' },
  { id: 'candlelit-parlour', category: 'academia', image: '/backgrounds/candlelit-parlour.jpg' },
  { id: 'lantern-courtyard', category: 'gothic', image: '/backgrounds/lantern-courtyard.jpg' },
]

function BackgroundDialog({ currentBackground, onSelect, onClose }) {
  const { t } = useI18n()
  const [category, setCategory] = useState('all')
  const categories = ['all', ...new Set(BACKGROUNDS.map(item => item.category))]
  const visibleBackgrounds = category === 'all' ? BACKGROUNDS : BACKGROUNDS.filter(item => item.category === category)
  useEffect(() => {
    const handler = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section className="tasks-dialog background-dialog" role="dialog" aria-modal="true" aria-labelledby="background-dialog-title">
      <div className="dialog-topline"><div className="panel-label">{t('bg.label')}</div><button type="button" className="dialog-close" onClick={onClose} aria-label={t('bg.close')}>×</button></div>
      <h2 id="background-dialog-title">{t('bg.title')}</h2><p className="dialog-description">{t('bg.desc')}</p>
      <div className="background-categories" role="group" aria-label={t('bg.categories')}>{categories.map(item => <button type="button" key={item} className={`background-category ${category === item ? 'active' : ''}`} onClick={() => setCategory(item)}>{t(`cat.${item}`)}</button>)}</div>
      <div className="background-options">{visibleBackgrounds.map(item => <button type="button" key={item.id} className={`background-option ${currentBackground === item.id ? 'selected' : ''}`} onClick={() => onSelect(item.id)} aria-pressed={currentBackground === item.id}>
        <span className="background-thumb" style={item.image ? { backgroundImage: `linear-gradient(rgba(10,18,14,.18),rgba(10,18,14,.3)), url("${item.image}")` } : undefined}><span>{item.id === 'none' ? 'QUIETLY' : ''}</span></span>
        <span className="background-option-name">{t(`bg.${item.id}.name`)}</span><span className="background-option-mood">{t(`bg.${item.id}.mood`)}</span>{currentBackground === item.id && <span className="theme-selected">{t('bg.selected')}</span>}
      </button>)}</div>
      <div className="tasks-dialog-footer"><span>{t('bg.saved')}</span><button type="button" className="close-dialog-button" onClick={onClose}>{t('dialog.done')}</button></div>
    </section>
  </div>
}

const PHOTO_PALETTES = {
  'hemlock-path': { cream:'#e2edde', sage:'#b5cbae', gold:'#a8c89d', muted:'#c2d0be', panel:'rgba(36,42,34,0.72)', border:'rgba(198,217,191,0.18)', deep:'#131811', 'gold-rgb':'168,200,157', 'sage-rgb':'181,203,174', 'tint-rgb':'198,217,191', 'ink-rgb':'9,12,8', 'dialog-a':'rgba(41,48,39,0.98)', 'dialog-b':'rgba(22,25,20,0.98)', 'panel-hover':'rgba(46,54,43,0.78)', 'card-a':'rgba(46,54,43,0.72)', 'card-b':'rgba(29,34,27,0.62)', 'focus-a':'rgba(48,57,45,0.7)', 'focus-b':'rgba(29,34,27,0.62)', shade:'rgba(12,15,10,0.5)' },
  'mossy-stream': { cream:'#e9edde', sage:'#c2cbae', gold:'#bbc89d', muted:'#cad0be', panel:'rgba(40,42,34,0.72)', border:'rgba(210,217,191,0.18)', deep:'#161811', 'gold-rgb':'187,200,157', 'sage-rgb':'194,203,174', 'tint-rgb':'210,217,191', 'ink-rgb':'11,12,7', 'dialog-a':'rgba(45,48,39,0.98)', 'dialog-b':'rgba(24,25,20,0.98)', 'panel-hover':'rgba(51,54,43,0.78)', 'card-a':'rgba(51,54,43,0.72)', 'card-b':'rgba(32,34,27,0.62)', 'focus-a':'rgba(53,57,45,0.7)', 'focus-b':'rgba(32,34,27,0.62)', shade:'rgba(14,15,10,0.5)' },
  'candlelit-window': { cream:'#ede7de', sage:'#cbbfae', gold:'#cab69b', muted:'#d0c8be', panel:'rgba(44,39,33,0.72)', border:'rgba(217,206,191,0.18)', deep:'#191510', 'gold-rgb':'202,182,155', 'sage-rgb':'203,191,174', 'tint-rgb':'217,206,191', 'ink-rgb':'13,11,8', 'dialog-a':'rgba(49,44,37,0.98)', 'dialog-b':'rgba(26,23,20,0.98)', 'panel-hover':'rgba(55,50,42,0.78)', 'card-a':'rgba(55,50,42,0.72)', 'card-b':'rgba(35,31,26,0.62)', 'focus-a':'rgba(59,52,43,0.7)', 'focus-b':'rgba(35,31,26,0.62)', shade:'rgba(16,13,10,0.5)' },
  'reading-corner': { cream:'#ede4de', sage:'#cbbaae', gold:'#cfae96', muted:'#d0c5be', panel:'rgba(45,37,32,0.72)', border:'rgba(217,202,191,0.18)', deep:'#1a130f', 'gold-rgb':'207,174,150', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'13,10,7', 'dialog-a':'rgba(51,42,36,0.98)', 'dialog-b':'rgba(27,22,19,0.98)', 'panel-hover':'rgba(57,47,40,0.78)', 'card-a':'rgba(57,47,40,0.72)', 'card-b':'rgba(36,30,25,0.62)', 'focus-a':'rgba(61,49,41,0.7)', 'focus-b':'rgba(36,30,25,0.62)', shade:'rgba(16,12,9,0.5)' },
  'window-nook': { cream:'#eddedf', sage:'#cbaeb1', gold:'#d0959a', muted:'#d0bebf', panel:'rgba(47,29,31,0.72)', border:'rgba(217,191,193,0.18)', deep:'#1b0e0f', 'gold-rgb':'208,149,154', 'sage-rgb':'203,174,177', 'tint-rgb':'217,191,193', 'ink-rgb':'13,7,8', 'dialog-a':'rgba(54,33,35,0.98)', 'dialog-b':'rgba(28,17,18,0.98)', 'panel-hover':'rgba(60,37,39,0.78)', 'card-a':'rgba(60,37,39,0.72)', 'card-b':'rgba(38,23,24,0.62)', 'focus-a':'rgba(65,37,39,0.7)', 'focus-b':'rgba(38,23,24,0.62)', shade:'rgba(17,9,10,0.5)' },
  'rainy-evening': { cream:'#ede4de', sage:'#cbbaae', gold:'#caaf9b', muted:'#d0c5be', panel:'rgba(44,37,33,0.72)', border:'rgba(217,202,191,0.18)', deep:'#191410', 'gold-rgb':'202,175,155', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'13,10,8', 'dialog-a':'rgba(50,42,37,0.98)', 'dialog-b':'rgba(26,22,20,0.98)', 'panel-hover':'rgba(55,47,42,0.78)', 'card-a':'rgba(55,47,42,0.72)', 'card-b':'rgba(35,30,26,0.62)', 'focus-a':'rgba(59,50,43,0.7)', 'focus-b':'rgba(35,30,26,0.62)', shade:'rgba(16,12,10,0.5)' },
  'teal-fog': { cream:'#dee9ed', sage:'#aec4cb', gold:'#95c1d0', muted:'#becbd0', panel:'rgba(27,44,50,0.72)', border:'rgba(191,210,217,0.18)', deep:'#0e171b', 'gold-rgb':'149,193,208', 'sage-rgb':'174,196,203', 'tint-rgb':'191,210,217', 'ink-rgb':'7,12,13', 'dialog-a':'rgba(30,50,56,0.98)', 'dialog-b':'rgba(16,26,30,0.98)', 'panel-hover':'rgba(34,56,63,0.78)', 'card-a':'rgba(34,56,63,0.72)', 'card-b':'rgba(21,35,40,0.62)', 'focus-a':'rgba(33,60,69,0.7)', 'focus-b':'rgba(21,35,40,0.62)', shade:'rgba(9,15,17,0.5)' },
  'loch-dusk': { cream:'#dee2ed', sage:'#aeb5cb', gold:'#95a4d0', muted:'#bec2d0', panel:'rgba(27,33,50,0.72)', border:'rgba(191,198,217,0.18)', deep:'#0e111b', 'gold-rgb':'149,164,208', 'sage-rgb':'174,181,203', 'tint-rgb':'191,198,217', 'ink-rgb':'7,9,13', 'dialog-a':'rgba(30,37,56,0.98)', 'dialog-b':'rgba(16,20,30,0.98)', 'panel-hover':'rgba(34,41,63,0.78)', 'card-a':'rgba(34,41,63,0.72)', 'card-b':'rgba(21,26,40,0.62)', 'focus-a':'rgba(33,42,69,0.7)', 'focus-b':'rgba(21,26,40,0.62)', shade:'rgba(9,11,17,0.5)' },
  'skye-cottage': { cream:'#dee9ed', sage:'#aec4cb', gold:'#95c1d0', muted:'#becbd0', panel:'rgba(27,44,50,0.72)', border:'rgba(191,210,217,0.18)', deep:'#0e171b', 'gold-rgb':'149,193,208', 'sage-rgb':'174,196,203', 'tint-rgb':'191,210,217', 'ink-rgb':'7,12,13', 'dialog-a':'rgba(30,50,56,0.98)', 'dialog-b':'rgba(16,26,30,0.98)', 'panel-hover':'rgba(34,56,63,0.78)', 'card-a':'rgba(34,56,63,0.72)', 'card-b':'rgba(21,35,40,0.62)', 'focus-a':'rgba(33,60,69,0.7)', 'focus-b':'rgba(21,35,40,0.62)', shade:'rgba(9,15,17,0.5)' },
  'golden-loch': { cream:'#ede4de', sage:'#cbbaae', gold:'#d0ae95', muted:'#d0c5be', panel:'rgba(50,36,27,0.72)', border:'rgba(217,202,191,0.18)', deep:'#1b130e', 'gold-rgb':'208,174,149', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'13,10,7', 'dialog-a':'rgba(56,41,30,0.98)', 'dialog-b':'rgba(30,22,16,0.98)', 'panel-hover':'rgba(63,46,34,0.78)', 'card-a':'rgba(63,46,34,0.72)', 'card-b':'rgba(40,29,21,0.62)', 'focus-a':'rgba(69,48,33,0.7)', 'focus-b':'rgba(40,29,21,0.62)', shade:'rgba(17,12,9,0.5)' },
  'snowfall-forest': { cream:'#dedfed', sage:'#aeb1cb', gold:'#959ad0', muted:'#bebfd0', panel:'rgba(28,30,48,0.72)', border:'rgba(191,193,217,0.18)', deep:'#0e0f1b', 'gold-rgb':'149,154,208', 'sage-rgb':'174,177,203', 'tint-rgb':'191,193,217', 'ink-rgb':'7,8,13', 'dialog-a':'rgba(32,34,55,0.98)', 'dialog-b':'rgba(17,18,29,0.98)', 'panel-hover':'rgba(36,38,61,0.78)', 'card-a':'rgba(36,38,61,0.72)', 'card-b':'rgba(23,24,39,0.62)', 'focus-a':'rgba(35,38,67,0.7)', 'focus-b':'rgba(23,24,39,0.62)', shade:'rgba(9,10,17,0.5)' },
  'snowy-path': { cream:'#e3e5e8', sage:'#b8bcc1', gold:'#acb1b9', muted:'#c4c6ca', panel:'rgba(37,38,40,0.72)', border:'rgba(200,203,208,0.18)', deep:'#131416', 'gold-rgb':'172,177,185', 'sage-rgb':'184,188,193', 'tint-rgb':'200,203,208', 'ink-rgb':'9,10,11', 'dialog-a':'rgba(41,43,45,0.98)', 'dialog-b':'rgba(22,23,24,0.98)', 'panel-hover':'rgba(47,48,50,0.78)', 'card-a':'rgba(47,48,50,0.72)', 'card-b':'rgba(29,30,32,0.62)', 'focus-a':'rgba(49,51,53,0.7)', 'focus-b':'rgba(29,30,32,0.62)', shade:'rgba(12,13,14,0.5)' },
  'fireside-christmas': { cream:'#ede4de', sage:'#cbbaae', gold:'#d0ad95', muted:'#d0c5be', panel:'rgba(45,37,31,0.72)', border:'rgba(217,202,191,0.18)', deep:'#1b130e', 'gold-rgb':'208,173,149', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'13,10,7', 'dialog-a':'rgba(51,42,35,0.98)', 'dialog-b':'rgba(27,22,19,0.98)', 'panel-hover':'rgba(57,47,40,0.78)', 'card-a':'rgba(57,47,40,0.72)', 'card-b':'rgba(36,30,25,0.62)', 'focus-a':'rgba(62,49,40,0.7)', 'focus-b':'rgba(36,30,25,0.62)', shade:'rgba(17,12,9,0.5)' },
  'gothic-christmas': { cream:'#ede4de', sage:'#cbbaae', gold:'#c8af9d', muted:'#d0c5be', panel:'rgba(42,38,34,0.72)', border:'rgba(217,202,191,0.18)', deep:'#181411', 'gold-rgb':'200,175,157', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'12,10,9', 'dialog-a':'rgba(48,43,39,0.98)', 'dialog-b':'rgba(25,23,21,0.98)', 'panel-hover':'rgba(53,48,44,0.78)', 'card-a':'rgba(53,48,44,0.72)', 'card-b':'rgba(34,30,28,0.62)', 'focus-a':'rgba(57,50,45,0.7)', 'focus-b':'rgba(34,30,28,0.62)', shade:'rgba(15,12,11,0.5)' },
  'long-library': { cream:'#ede4de', sage:'#cbbaae', gold:'#c8af9d', muted:'#d0c5be', panel:'rgba(42,38,34,0.72)', border:'rgba(217,202,191,0.18)', deep:'#181411', 'gold-rgb':'200,175,157', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'12,10,8', 'dialog-a':'rgba(48,43,39,0.98)', 'dialog-b':'rgba(25,23,21,0.98)', 'panel-hover':'rgba(54,48,43,0.78)', 'card-a':'rgba(54,48,43,0.72)', 'card-b':'rgba(34,30,27,0.62)', 'focus-a':'rgba(57,50,45,0.7)', 'focus-b':'rgba(34,30,27,0.62)', shade:'rgba(15,12,10,0.5)' },
  'arched-window-study': { cream:'#ede4de', sage:'#cbbaae', gold:'#ceae97', muted:'#d0c5be', panel:'rgba(45,37,32,0.72)', border:'rgba(217,202,191,0.18)', deep:'#1a130f', 'gold-rgb':'206,174,151', 'sage-rgb':'203,186,174', 'tint-rgb':'217,202,191', 'ink-rgb':'13,10,7', 'dialog-a':'rgba(51,42,36,0.98)', 'dialog-b':'rgba(27,22,19,0.98)', 'panel-hover':'rgba(57,47,40,0.78)', 'card-a':'rgba(57,47,40,0.72)', 'card-b':'rgba(36,30,26,0.62)', 'focus-a':'rgba(61,49,41,0.7)', 'focus-b':'rgba(36,30,26,0.62)', shade:'rgba(16,12,9,0.5)' },
  'candlelit-parlour': { cream:'#ede2de', sage:'#cbb5ae', gold:'#c8a89d', muted:'#d0c2be', panel:'rgba(43,36,34,0.72)', border:'rgba(217,198,191,0.18)', deep:'#181311', 'gold-rgb':'200,168,157', 'sage-rgb':'203,181,174', 'tint-rgb':'217,198,191', 'ink-rgb':'12,9,8', 'dialog-a':'rgba(48,41,39,0.98)', 'dialog-b':'rgba(26,22,20,0.98)', 'panel-hover':'rgba(54,46,43,0.78)', 'card-a':'rgba(54,46,43,0.72)', 'card-b':'rgba(34,29,27,0.62)', 'focus-a':'rgba(58,48,44,0.7)', 'focus-b':'rgba(34,29,27,0.62)', shade:'rgba(15,12,10,0.5)' },
  'lantern-courtyard': { cream:'#ede2de', sage:'#cbb5ae', gold:'#caa79b', muted:'#d0c2be', panel:'rgba(44,36,33,0.72)', border:'rgba(217,198,191,0.18)', deep:'#191210', 'gold-rgb':'202,167,155', 'sage-rgb':'203,181,174', 'tint-rgb':'217,198,191', 'ink-rgb':'13,9,8', 'dialog-a':'rgba(49,40,37,0.98)', 'dialog-b':'rgba(26,21,20,0.98)', 'panel-hover':'rgba(55,45,42,0.78)', 'card-a':'rgba(55,45,42,0.72)', 'card-b':'rgba(35,28,26,0.62)', 'focus-a':'rgba(59,47,43,0.7)', 'focus-b':'rgba(35,28,26,0.62)', shade:'rgba(16,11,10,0.5)' },
}

function paletteForBackground(id) { return PHOTO_PALETTES[id] || PHOTO_PALETTES['hemlock-path'] }



const SOUND_DEFS = [
  { id: 'rain', base: 1.8 },
  { id: 'brown', base: 0.9 },
  { id: 'forest', base: 2.2 },
]

function makeLoopBuffer(ctx, seconds, fill) {
  const rate = ctx.sampleRate
  const fade = Math.floor(rate * 1.2)
  const n = Math.floor(rate * seconds)
  const raw = new Float32Array(n + fade)
  fill(raw)
  let peak = 0
  for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]))
  const scale = peak > 0 ? 0.9 / peak : 1
  const buffer = ctx.createBuffer(1, n, rate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) data[i] = raw[i] * scale
  for (let i = 0; i < fade; i++) { const t = i / fade; data[i] = (raw[i] * Math.sqrt(t) + raw[n + i] * Math.sqrt(1 - t)) * scale }
  return buffer
}
const fillWhite = raw => { for (let i = 0; i < raw.length; i++) raw[i] = Math.random() * 2 - 1 }
const fillPink = raw => {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < raw.length; i++) {
    const w = Math.random() * 2 - 1
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898
    raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
    b6 = w * 0.115926
  }
}
const fillBrown = raw => { let last = 0; for (let i = 0; i < raw.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; raw[i] = last * 3.5 } }

function buildLayer(id, ctx, B, out) {
  const nodes = []
  const state = { interval: null, timeout: null }
  const src = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * buf.duration); nodes.push(s); return s }
  const filter = (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q; return f }
  const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g }
  const lfo = (freq, depth, param) => { const o = ctx.createOscillator(); o.frequency.value = freq; o.connect(gain(depth)).connect(param); o.start(); nodes.push(o) }

  if (id === 'rain') {
    const bed = gain(0.5)
    src(B.pink).connect(filter('highpass', 450)).connect(filter('lowpass', 7000)).connect(bed).connect(out)
    lfo(0.07, 0.07, bed.gain)
    src(B.white).connect(filter('bandpass', 4200, 0.5)).connect(gain(0.08)).connect(out)
    src(B.brown).connect(filter('lowpass', 220)).connect(gain(0.3)).connect(out)
    const drop = t => {
      const s = ctx.createBufferSource(); s.buffer = B.white
      const g = ctx.createGain(); const peak = 0.04 + Math.random() * 0.14
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.05)
      const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8
      s.connect(filter('bandpass', 1200 + Math.random() * 4300, 1 + Math.random() * 2.5)).connect(g).connect(p).connect(out)
      s.start(t, Math.random() * 5); s.stop(t + 0.12)
    }
    let nextT = ctx.currentTime
    const pump = () => {
      const horizon = ctx.currentTime + 1.2
      if (nextT < ctx.currentTime) nextT = ctx.currentTime
      while (nextT < horizon) { drop(nextT); nextT += -Math.log(1 - Math.random()) / 55 }
    }
    pump(); state.interval = setInterval(pump, 300)
  }

  if (id === 'brown') {
    src(B.brown).connect(filter('lowpass', 1100, 0.3)).connect(gain(1)).connect(out)
  }

  if (id === 'forest') {
    const w1 = gain(0.5); src(B.pink).connect(filter('bandpass', 380, 0.7)).connect(w1).connect(out); lfo(0.09, 0.35, w1.gain)
    const w2 = gain(0.18); src(B.pink).connect(filter('bandpass', 1000, 0.6)).connect(w2).connect(out); lfo(0.06, 0.12, w2.gain)
    const leaves = gain(0.05); src(B.white).connect(filter('highpass', 3800)).connect(filter('lowpass', 8500)).connect(leaves).connect(out); lfo(0.17, 0.03, leaves.gain)
    const bus = gain(1.2); bus.connect(out)
    const dly = ctx.createDelay(1); dly.delayTime.value = 0.23
    const fb = gain(0.3), lp = filter('lowpass', 3200), wet = gain(0.4)
    dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(wet); wet.connect(out); bus.connect(dly)
    const chirp = (t, f0, f1, dur, peak, pan) => {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      const p = ctx.createStereoPanner(); p.pan.value = pan
      g.connect(p).connect(bus)
      ;[[1, 1], [2.01, 0.22]].forEach(([mult, level]) => {
        const o = ctx.createOscillator(); o.type = 'sine'
        o.frequency.setValueAtTime(f0 * mult, t); o.frequency.exponentialRampToValueAtTime(f1 * mult, t + dur)
        o.connect(gain(level)).connect(g); o.start(t); o.stop(t + dur + 0.05)
      })
    }
    const phrase = () => {
      const t = ctx.currentTime + 0.05, pan = Math.random() * 1.4 - 0.7, base = 2200 + Math.random() * 2200, kind = Math.random()
      if (kind < 0.55) { const n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) chirp(t + i * (0.12 + Math.random() * 0.05), base * (1 + Math.random() * 0.06), base * (1.25 + Math.random() * 0.2), 0.07 + Math.random() * 0.05, 0.07, pan) }
      else if (kind < 0.85) { chirp(t, base * 0.8, base * 0.7, 0.32, 0.06, pan); chirp(t + 0.38, base * 0.7, base * 0.55, 0.4, 0.05, pan) }
      else { for (let i = 0; i < 8; i++) chirp(t + i * 0.055, base * (1.1 - i * 0.03), base * (0.95 - i * 0.03), 0.04, 0.05, pan) }
      state.timeout = setTimeout(phrase, 2500 + Math.random() * 7000)
    }
    state.timeout = setTimeout(phrase, 800)
  }

  return () => {
    clearInterval(state.interval); clearTimeout(state.timeout)
    nodes.forEach(n => { try { n.stop() } catch (e) {} try { n.disconnect() } catch (e) {} })
    try { out.disconnect() } catch (e) {}
  }
}

const SoundEngine = {
  ctx: null, master: null, buffers: null, layers: {},
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return false
      const ctx = new AC()
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3
      this.master = ctx.createGain(); this.master.gain.value = 0.9
      this.master.connect(comp); comp.connect(ctx.destination)
      this.buffers = { white: makeLoopBuffer(ctx, 8, fillWhite), pink: makeLoopBuffer(ctx, 10, fillPink), brown: makeLoopBuffer(ctx, 12, fillBrown) }
      this.ctx = ctx
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return true
  },
  start(id, level) {
    if (this.layers[id] || !this.ensure()) return
    const out = this.ctx.createGain(); out.gain.value = 0; out.connect(this.master)
    const cleanup = buildLayer(id, this.ctx, this.buffers, out)
    out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.6)
    this.layers[id] = { out, cleanup }
  },
  startFile(id, url, level, onFail, onCleanup) {
    if (this.layers[id] || !this.ensure()) return false
    const ctx = this.ctx
    const audio = new Audio()
    audio.loop = true; audio.preload = 'auto'; audio.src = url
    const node = ctx.createMediaElementSource(audio)
    const out = ctx.createGain(); out.gain.value = 0
    node.connect(out); out.connect(this.master)
    const cleanup = () => {
      try { audio.pause(); audio.removeAttribute('src'); audio.load() } catch (e) {}
      try { node.disconnect(); out.disconnect() } catch (e) {}
      if (onCleanup) onCleanup()
    }
    audio.addEventListener('error', () => { if (this.layers[id]) { delete this.layers[id]; cleanup(); if (onFail) onFail() } })
    const started = audio.play()
    if (started && started.catch) started.catch(() => { if (this.layers[id]) { delete this.layers[id]; cleanup(); if (onFail) onFail() } })
    out.gain.setTargetAtTime(level, ctx.currentTime, 0.8)
    this.layers[id] = { out, cleanup }
    return true
  },
  stop(id) {
    const layer = this.layers[id]; if (!layer) return
    delete this.layers[id]
    layer.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.35)
    setTimeout(layer.cleanup, 2000)
  },
  setLevel(id, level) { const layer = this.layers[id]; if (layer) layer.out.gain.setTargetAtTime(level, this.ctx.currentTime, 0.1) },
  stopAll() { Object.keys(this.layers).forEach(id => this.stop(id)) },
}

const SOUND_ICONS = {
  rain: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 18l-1 3M12 18l-1 3M17 18l-1 3"/><path d="M6.5 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 1.5A3.2 3.2 0 0 1 17 15z"/></svg>,
  brown: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/></svg>,
  forest: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/></svg>,
  bird: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 16c4 1 8 0 10-3 1-1.500 1-3 3-3.500l3-.5-1.500 2c0 4-3 8-8 8-3 0-5-1-6.500-3z"/><circle cx="16.500" cy="9" r=".6"/></svg>,
  fire: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1.500 1 2 2 2 0-3-1-5 1-8z"/></svg>,
  cup: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.500a2.500 2.500 0 0 1 0 5H16M9 3v2M12 3v2"/></svg>,
  snow: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v18M4.500 7.500l15 9M19.500 7.500l-15 9"/><path d="M9.500 4.500L12 6.500l2.500-2M9.500 19.500L12 17.500l2.500 2"/></svg>,
  note: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="16.500" cy="16" r="2.500"/></svg>,
}

const BUNDLED_SOUNDS = [
  { key: 'rain-thunder', url: '/sounds/rain-thunder.m4a', base: 1.6, icon: 'rain', credit: 'Rain and thunder: Pixabay' },
  { key: 'winter-wind', url: '/sounds/winter-wind.m4a', base: 1.4, icon: 'snow', credit: 'Winter wind: DRAGON-STUDIO, Pixabay' },
  { key: 'cafe-murmur', url: '/sounds/cafe-murmur.m4a', base: 1.8, icon: 'cup', credit: 'Café murmur: freesound_community, Pixabay' },
  { key: 'wind-in-trees', url: '/sounds/wind-in-trees.m4a', base: 1.6, icon: 'forest', credit: 'Wind in the trees: freesound_community, Pixabay' },
  { key: 'night-sea', url: '/sounds/night-sea.m4a', base: 1.6, icon: 'brown', credit: 'Night sea: freesound_community, Pixabay' },
  { key: 'fire-crackling', url: '/sounds/fire-crackling.m4a', base: 2, icon: 'fire', credit: 'Crackling fire: Jurij (soundreality), Pixabay' },
  { key: 'small-stream', url: '/sounds/small-stream.m4a', base: 1.6, icon: 'brown', credit: 'Small stream: freesound_community, Pixabay' },
  { key: 'gentle-rain', url: '/sounds/gentle-rain.m4a', base: 1.6, icon: 'rain', credit: 'Gentle rain: Dragon-Studio, Pixabay' },
  { key: 'birdsong', url: '/sounds/birdsong.m4a', base: 1.6, icon: 'bird', credit: 'Birdsong: klankbeeld, "Lake Engelermeer", Freesound, CC BY 4.0' },
]

function soundDb() { return new Promise((resolve, reject) => { const r = indexedDB.open('quietly_sounds', 1); r.onupgradeneeded = () => r.result.createObjectStore('sounds', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) }) }
async function soundDbRun(mode, fn) { const db = await soundDb(); return new Promise((resolve, reject) => { const tx = db.transaction('sounds', mode); const req = fn(tx.objectStore('sounds')); tx.oncomplete = () => { db.close(); resolve(req && req.result) }; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error) }) }
const listUserSounds = () => soundDbRun('readonly', store => store.getAll())
const saveUserSound = record => soundDbRun('readwrite', store => store.put(record))
const deleteUserSound = id => soundDbRun('readwrite', store => store.delete(id))
const cleanSoundName = filename => filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'My sound'

function SoundMixer() {
  const { t } = useI18n()
  const [levels, setLevels] = useState(() => {
    const saved = readStored('sound-levels', null).value
    const base = { rain: 0.6, brown: 0.5, forest: 0.6, birdsong: 0.5 }
    if (saved && typeof saved === 'object') Object.keys(saved).forEach(key => { if (typeof saved[key] === 'number' && saved[key] >= 0 && saved[key] <= 1) base[key] = saved[key] })
    return base
  })
  const [active, setActive] = useState({})
  const [userSounds, setUserSounds] = useState([])
  const [pending, setPending] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [message, setMessage] = useState('')
  const fileInput = useRef(null)
  const urls = useRef({})
  useEffect(() => {
    let alive = true
    listUserSounds().then(list => { if (alive && Array.isArray(list)) setUserSounds(list.sort((a, b) => a.added - b.added)) }).catch(() => {})
    return () => { alive = false; SoundEngine.stopAll() }
  }, [])
  const items = [
    ...SOUND_DEFS.map(d => ({ key: d.id, name: t(`sound.${d.id}.name`), hint: t(`sound.${d.id}.hint`), base: d.base, icon: d.id, kind: 'synth' })),
    ...BUNDLED_SOUNDS.map(d => ({ ...d, name: t(`sound.${d.key}.name`), hint: `${t(`sound.${d.key}.hint`)} · ${t('sound.recording')}`, kind: 'file' })),
    ...userSounds.map(u => ({ key: `user:${u.id}`, name: u.name, hint: t('sound.yours'), base: 3, icon: 'note', kind: 'user', record: u })),
  ]
  const levelOf = item => levels[item.key] ?? 0.5
  const setOff = key => setActive(a => ({ ...a, [key]: false }))
  const toggle = item => {
    setMessage('')
    if (active[item.key]) { SoundEngine.stop(item.key); setOff(item.key); return }
    if (!SoundEngine.ensure()) { setMessage(t('sound.unsupported')); return }
    const level = levelOf(item) * levelOf(item) * item.base
    if (item.kind === 'synth') SoundEngine.start(item.key, level)
    else {
      let url = item.url
      if (item.kind === 'user') { url = URL.createObjectURL(item.record.blob); urls.current[item.key] = url }
      SoundEngine.startFile(item.key, url, level, () => { setOff(item.key); setMessage(t('sound.cantPlay', { name: item.name })) }, () => { if (urls.current[item.key]) { URL.revokeObjectURL(urls.current[item.key]); delete urls.current[item.key] } })
    }
    setActive(a => ({ ...a, [item.key]: true }))
  }
  const change = (item, value) => {
    const next = { ...levels, [item.key]: value }
    setLevels(next); writeStored('sound-levels', next)
    SoundEngine.setLevel(item.key, value * value * item.base)
  }
  const stopAll = () => { SoundEngine.stopAll(); setActive({}) }
  const pickFile = event => {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file) return
    if (!(file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i.test(file.name))) { setMessage(t('sound.notAudio')); return }
    if (file.size > 150 * 1024 * 1024) { setMessage(t('sound.tooBig')); return }
    setMessage(''); setPending({ file, name: cleanSoundName(file.name) })
  }
  const savePending = async event => {
    event.preventDefault()
    if (!pending) return
    const record = { id: `${Date.now()}`, name: pending.name.trim() || t('sound.defaultName'), type: pending.file.type, blob: pending.file, added: Date.now() }
    try { await saveUserSound(record); setUserSounds(list => [...list, record]); setPending(null) }
    catch (error) { setMessage(t('sound.cantSave')); setPending(null) }
  }
  const removeSound = async item => {
    if (confirmRemove !== item.key) { setConfirmRemove(item.key); return }
    SoundEngine.stop(item.key); setOff(item.key); setConfirmRemove(null)
    try { await deleteUserSound(item.record.id) } catch (error) {}
    setUserSounds(list => list.filter(u => u.id !== item.record.id))
  }
  const anyOn = Object.values(active).some(Boolean)
  const renderRow = item => <div key={item.key} className={`sound-row ${active[item.key] ? 'on' : ''}`}>
    <button type="button" className="sound-toggle" onClick={() => toggle(item)} aria-pressed={!!active[item.key]}>
      <span className="sound-icon">{SOUND_ICONS[item.icon]}</span>
      <span className="sound-text"><span className="sound-name">{item.name}</span><span className="sound-hint">{active[item.key] ? t('sound.playing') : item.hint}</span></span>
    </button>
    <input type="range" min="0" max="1" step="0.01" value={levelOf(item)} onChange={e => change(item, Number(e.target.value))} aria-label={t('sound.volume', { name: item.name })} />
    {item.kind === 'user' && <button type="button" className={`sound-remove ${confirmRemove === item.key ? 'confirm' : ''}`} onClick={() => removeSound(item)} onBlur={() => setConfirmRemove(null)} aria-label={t('sound.remove', { name: item.name })}>{confirmRemove === item.key ? t('sound.removeConfirm') : '×'}</button>}
  </div>
  const credits = BUNDLED_SOUNDS.map(d => d.credit)
  return <section className="panel sound sound-mixer">
    <div className="panel-heading"><div className="panel-label">{t('sound.label')}</div>{anyOn && <button type="button" className="sound-stop" onClick={stopAll}>{t('sound.stopAll')}</button>}</div>
    <h2>{t('sound.title')}</h2>
    <div className="sound-rows">
      <div className="sound-group">{t('sound.groupBuiltin')}</div>
      {items.filter(i => i.kind === 'synth').map(renderRow)}
      <div className="sound-group">{t('sound.groupRecordings')}</div>
      {items.filter(i => i.kind !== 'synth').map(renderRow)}
    </div>
    {pending
      ? <form className="sound-add-form" onSubmit={savePending}><input autoFocus value={pending.name} maxLength={40} onChange={e => setPending(p => ({ ...p, name: e.target.value }))} aria-label={t('sound.nameAria')} /><button type="submit">{t('sound.save')}</button><button type="button" onClick={() => setPending(null)}>{t('sound.cancel')}</button></form>
      : <button type="button" className="sound-add" onClick={() => fileInput.current && fileInput.current.click()}>{t('sound.add')}</button>}
    <input ref={fileInput} type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac" onChange={pickFile} hidden />
    {message && <p className="sound-note">{message}</p>}
    <details className="sound-credits"><summary>{t('sound.credits')}</summary>{credits.map(c => <p key={c}>{c}</p>)}</details>
  </section>
}

function formatTime(value, hour12, t) {
  if (!value) return ''
  const [h, m] = value.split(':').map(Number)
  const mm = String(m).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 || 12}:${mm} ${t(h >= 12 ? 'time.PM' : 'time.AM')}`
}

function TimePicker({ value, onChange, label, up = false, compact = false }) {
  const { t, hour12 } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const now = new Date()
  const h24 = value ? Number(value.split(':')[0]) : now.getHours()
  const minute = value ? value.split(':')[1] : '00'
  const period = h24 >= 12 ? 'PM' : 'AM'
  const hour12Value = h24 % 12 || 12
  const hours = hour12 ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
  useEffect(() => {
    if (!open) return
    const onDown = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    ref.current?.querySelectorAll('.time-col').forEach(col => { const el = col.querySelector('.selected'); if (el) col.scrollTop = el.offsetTop - col.clientHeight / 2 + el.clientHeight / 2 })
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  const emit = (h12, m, p) => onChange(`${String((h12 % 12) + (p === 'PM' ? 12 : 0)).padStart(2, '0')}:${m}`)
  const emit24 = (h, m) => onChange(`${String(h).padStart(2, '0')}:${m}`)
  const selectedHour = hour12 ? hour12Value : h24
  return <div className="time-picker" ref={ref}>
    <button type="button" className={`time-trigger ${compact ? 'compact' : ''} ${value ? '' : 'is-empty'}`} onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={compact ? t('plan.changeTime') : undefined}>
      <span>{value ? formatTime(value, hour12, t) : hour12 ? '--:-- --' : '--:--'}</span>
      {!compact && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>}
    </button>
    {open && <div className={`time-pop ${up ? 'up' : 'down'}`} role="dialog" aria-label={label}>
      <div className="time-cols">
        <div className="time-col" aria-label={t('plan.hour')}>{hours.map(h => <button type="button" key={h} className={value && h === selectedHour ? 'selected' : ''} onClick={() => hour12 ? emit(h, minute, period) : emit24(h, minute)}>{hour12 ? h : String(h).padStart(2, '0')}</button>)}</div>
        <div className="time-col" aria-label={t('plan.minute')}>{minutes.map(m => <button type="button" key={m} className={value && m === minute ? 'selected' : ''} onClick={() => hour12 ? emit(hour12Value, m, period) : emit24(h24, m)}>{m}</button>)}</div>
        {hour12 && <div className="time-col time-col-period" aria-label={t('plan.period')}>{['AM', 'PM'].map(p => <button type="button" key={p} className={value && p === period ? 'selected' : ''} onClick={() => emit(hour12Value, minute, p)}>{t(`time.${p}`)}</button>)}</div>}
      </div>
      <button type="button" className="time-done" onClick={() => setOpen(false)}>{t('dialog.done')}</button>
    </div>}
  </div>
}

const DEFAULT_PLAN_EN = { morning: 'Start gently', midday: 'Lunch / reset', afternoon: 'Wrap up & plan' }

function PlanBlock({ block, onChange, onRemove }) {
  const { t } = useI18n()
  const shown = DEFAULT_PLAN_EN[block.id] && block.label === DEFAULT_PLAN_EN[block.id] ? t(`plan.default.${block.id}`) : block.label
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(shown)
  const save = () => { const next = text.trim(); if (next && next !== shown) onChange({ ...block, label: next }); else setText(shown); setEditing(false) }
  return <div className="plan-block">
    <TimePicker compact value={block.time} onChange={time => onChange({ ...block, time })} label={t('plan.timeFor', { label: shown })} />
    {editing
      ? <input className="plan-label plan-label-input" autoFocus value={text} maxLength={80} aria-label={t('plan.edit')} onChange={e => setText(e.target.value)} onBlur={save} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(shown); setEditing(false) } }} />
      : <button type="button" className="plan-label plan-label-button" onClick={() => { setText(shown); setEditing(true) }} title={t('plan.clickEdit')}>{shown}</button>}
    <button className="plan-remove" type="button" onClick={onRemove} aria-label={t('plan.remove', { label: shown })}>×</button>
  </div>
}

function GentlePlan() {
  const { t } = useI18n()
  const [blocks, setBlocks] = useState(() => { const saved = readStored('gentle-plan', null).value; return Array.isArray(saved) ? saved : [{id:'morning',time:'09:00',label:DEFAULT_PLAN_EN.morning},{id:'midday',time:'12:00',label:DEFAULT_PLAN_EN.midday},{id:'afternoon',time:'16:00',label:DEFAULT_PLAN_EN.afternoon}] })
  const [time, setTime] = useState('')
  const [label, setLabel] = useState('')
  const persist = next => { const sorted = [...next].sort((a,b)=>a.time.localeCompare(b.time)); setBlocks(sorted); writeStored('gentle-plan', sorted) }
  const addBlock = event => { event.preventDefault(); if(!time || !label.trim()) return; persist([...blocks,{id:`${Date.now()}`,time,label:label.trim()}]); setTime(''); setLabel('') }
  const updateBlock = updated => persist(blocks.map(block => block.id === updated.id ? updated : block))
  const removeBlock = id => persist(blocks.filter(block=>block.id!==id))
  return <section className="panel gentle-plan">
    <div className="panel-label">{t('plan.label')}</div>
    <div className="panel-heading"><h2>{t('plan.title')}</h2><span>{t('plan.today')}</span></div>
    <div className="plan-blocks">{blocks.map(block => <PlanBlock key={block.id} block={block} onChange={updateBlock} onRemove={() => removeBlock(block.id)} />)}</div>
    <form className="plan-add-form" onSubmit={addBlock}><TimePicker up value={time} onChange={setTime} label={t('plan.timeForNew')} /><input aria-label={t('plan.blockAria')} placeholder={t('plan.newBlock')} value={label} onChange={e=>setLabel(e.target.value)} maxLength={80}/><button type="submit" disabled={!time || !label.trim()}>+</button></form>
  </section>
}

function InlineList({ label, title, items, getText, isDone, sortDone = false, rowClass = '', doneClass = '', onAdd, onToggle, onEdit, onDelete, placeholder, empty, maxLength, footer }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const submit = event => { event.preventDefault(); const text = draft.trim(); if (!text) return; onAdd(text); setDraft('') }
  const saveEdit = id => { const text = editText.trim(); if (text) onEdit(id, text); setEditingId(null); setEditText('') }
  const ordered = sortDone ? [...items.filter(item => !isDone(item)), ...items.filter(isDone)] : items
  return <section className="panel inline-card">
    <div className="panel-label">{label}</div>
    <h2>{title}</h2>
    <form className="task-add-form inline-add" onSubmit={submit}>
      <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={placeholder} maxLength={maxLength} aria-label={placeholder} />
      <button type="submit" disabled={!draft.trim()} aria-label={t('list.add')}>+</button>
    </form>
    <div className="inline-list">
      {ordered.length === 0 ? <p className="task-empty">{empty}</p> : ordered.map(item => <div className={`task-row ${rowClass} ${isDone(item) ? doneClass : ''}`} key={item.id}>
        <button className="task-check" type="button" onClick={() => onToggle(item.id)} aria-label={isDone(item) ? t('list.markUndone') : t('list.markDone')}>{isDone(item) ? '✓' : ''}</button>
        {editingId === item.id
          ? <input className="task-edit-input" value={editText} onChange={event => setEditText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') saveEdit(item.id); if (event.key === 'Escape') setEditingId(null) }} autoFocus aria-label={t('list.edit')} />
          : <span className="task-text">{getText(item)}</span>}
        <div className="task-controls">
          {editingId === item.id
            ? <button type="button" className="task-control" onClick={() => saveEdit(item.id)} title={t('list.save')}>✓</button>
            : <button type="button" className="task-control" onClick={() => { setEditingId(item.id); setEditText(getText(item)) }} title={t('list.edit')} aria-label={t('list.edit')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg></button>}
          <button type="button" className="task-control task-delete" onClick={() => onDelete(item.id)} title={t('list.delete')} aria-label={t('list.delete')}>×</button>
        </div>
      </div>)}
    </div>
    <div className="inline-footer"><span className="inline-count">{footer}</span></div>
  </section>
}

function InlineNote({ label, title, value, onChange, onClear, placeholder, rows, maxLength, status, className = '' }) {
  const { t } = useI18n()
  return <section className={`panel inline-card ${className}`}>
    <div className="panel-label">{label}</div>
    <h2>{title}</h2>
    <textarea className="inline-textarea" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={rows} maxLength={maxLength} aria-label={title} />
    <div className="inline-footer">
      <span className={status === 'error' ? 'save-error' : ''} aria-live="polite">{status === 'error' ? t('note.saveError') : status === 'saved' ? t('note.saved') : t('note.typing')}</span>
      <button type="button" className="inline-clear" onClick={onClear} disabled={!value}>{t('note.clear')}</button>
    </div>
  </section>
}

function LanguageMenu() {
  const { t, lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = event => { if (ref.current && !ref.current.contains(event.target)) setOpen(false) }
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  return <div className="language-menu" ref={ref}>
    <button type="button" className="language-button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={t('header.language')} title={t('header.language')}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.500 18.400 12 21c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3z"/></svg>
    </button>
    {open && <div className="language-pop" role="listbox" aria-label={t('header.language')}>
      {LANGUAGES.map(item => <button type="button" role="option" aria-selected={item.code === lang} key={item.code} lang={item.code} className={item.code === lang ? 'selected' : ''} onClick={() => { setLang(item.code); setOpen(false) }}>{item.label}{item.code === lang && <span aria-hidden="true"> ✓</span>}</button>)}
    </div>}
  </div>
}

function App() {
  const [lang, setLangState] = useState(() => { const saved = readStored('language', null).value; return LANGUAGES.some(item => item.code === saved) ? saved : detectLanguage() })
  const i18n = useMemo(() => { const info = LANGUAGES.find(item => item.code === lang) || LANGUAGES[0]; return { lang, t: makeT(lang), locale: info.locale, hour12: info.hour12, setLang: code => { setLangState(code); writeStored('language', code) } } }, [lang])
  const t = i18n.t
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  const [theme, setTheme] = useState(() => { const saved = readStored('theme', 'forest').value; return THEMES.some(item => item.id === saved) ? saved : 'forest' })
  const [themeOpen, setThemeOpen] = useState(false)
  const [backgroundOpen, setBackgroundOpen] = useState(false)
  const [background, setBackground] = useState(() => { const saved = readStored('background', 'none').value; return BACKGROUNDS.some(item => item.id === saved) ? saved : 'none' })
  const chooseBackground = (nextBackground) => { setBackground(nextBackground); writeStored('background', nextBackground) }
  const chooseTheme = (nextTheme) => { setTheme(nextTheme); writeStored('theme', nextTheme) }
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () => document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch (error) { console.warn('Fullscreen could not be toggled:', error) }
  }
  const [today, setToday] = useState(localDateKey())
  const [intention, setIntention] = useState(() => {
    const saved = readStored('daily-intention', null).value
    return saved?.date === localDateKey() && typeof saved.text === 'string' ? saved.text : ''
  })
  const [saveStatus, setSaveStatus] = useState('idle')
  const [tasks, setTasks] = useState(() => { const saved = readStored('tasks', []); return Array.isArray(saved.value) ? saved.value : [] })
  const [habits, setHabits] = useState(() => { const saved = readStored('habits', []); return Array.isArray(saved.value) ? saved.value : [] })
  const [brainDump, setBrainDump] = useState(() => readStored('brain-dump', '').value || '')
  const [brainDumpStatus, setBrainDumpStatus] = useState('idle')
  const [focusOpen, setFocusOpen] = useState(false)


  useEffect(() => {
    const dayCheck = window.setInterval(() => {
      const currentDate = localDateKey()
      setToday(previous => previous === currentDate ? previous : currentDate)
    }, 30000)
    return () => window.clearInterval(dayCheck)
  }, [])


  useEffect(() => {
    const saved = readStored('daily-intention', null).value
    setIntention(saved?.date === today && typeof saved.text === 'string' ? saved.text : '')
    setSaveStatus('idle')
  }, [today])


  const handleIntentionChange = (text) => {
    setIntention(text)
    const result = writeStored('daily-intention', { date: today, text })
    setSaveStatus(result.ok ? 'saved' : 'error')
  }
  const persistTasks = (next) => { setTasks(next); writeStored('tasks', next) }
  const addTask = (text) => persistTasks([{ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, text, completed: false, createdAt: Date.now() }, ...tasks])
  const toggleTask = (id) => persistTasks(tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task))
  const editTask = (id, text) => persistTasks(tasks.map(task => task.id === id ? { ...task, text } : task))
  const deleteTask = (id) => persistTasks(tasks.filter(task => task.id !== id))
  const persistHabits = next => { setHabits(next); writeStored('habits', next) }
  const addHabit = name => persistHabits([{id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,name,completedDate:null}, ...habits])
  const toggleHabit = id => persistHabits(habits.map(h => h.id===id ? {...h,completedDate:h.completedDate===today?null:today} : h))
  const editHabit = (id,name) => persistHabits(habits.map(h=>h.id===id?{...h,name}:h))
  const deleteHabit = id => persistHabits(habits.filter(h=>h.id!==id))
  const handleBrainDumpChange = text => { setBrainDump(text); const result = writeStored('brain-dump', text); setBrainDumpStatus(result.ok ? 'saved' : 'error') }
  const clearBrainDump = () => handleBrainDumpChange('')

  const handleClear = () => {
    setIntention('')
    const result = writeStored('daily-intention', { date: today, text: '' })
    setSaveStatus(result.ok ? 'saved' : 'error')
  }

  const selectedBackground = BACKGROUNDS.find(item => item.id === background)
  return <I18nContext.Provider value={i18n}><main className="app-shell" data-theme={theme} style={theme === 'auto' ? Object.fromEntries(Object.entries(paletteForBackground(background)).map(([key, value]) => [`--${key}`, value])) : undefined}>
    {selectedBackground?.image && <div className="wallpaper" style={{ backgroundImage: `url("${selectedBackground.image}")` }} aria-hidden="true" />}
    {selectedBackground?.image && <div className="wallpaper-shade" aria-hidden="true" />}
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/><div className="grain" />
    <header className="topbar">
      <div className="wordmark">QUIETLY<span>.</span></div>
      <div className="top-caption">{t('app.caption')}</div>
      <div className="header-actions"><LanguageMenu /><button className="fullscreen-button" onClick={toggleFullscreen} aria-label={isFullscreen ? t('header.fullscreenExit') : t('header.fullscreenEnter')} title={isFullscreen ? t('header.fullscreenExit') : t('header.fullscreenEnter')}>{isFullscreen ? "⤡" : "⤢"}</button><button className="background-button" onClick={() => { setThemeOpen(false); setBackgroundOpen(true) }} aria-label={t('header.backgrounds')} title={t('header.backgroundsTip')}>▧</button><button className="settings-button" onClick={() => { setBackgroundOpen(false); setThemeOpen(true) }} aria-label={t('header.themes')} title={t('header.themesTip')}>☼</button></div>
    </header>
    <section className="hero-row">
      <Clock tasks={tasks} habits={habits} today={today} />
      <div className="hero-side">
        <QuoteOfTheDay />
        <InlineNote label={t('today.label')} title={t('today.title')} value={intention} onChange={handleIntentionChange} onClear={handleClear} placeholder={t('today.placeholder')} rows={2} maxLength={500} status={saveStatus} className="intention" />
      </div>
    </section>
    <section className="dashboard-grid">
      <div className="dashboard-column dashboard-left">
        <FocusPanel onOpen={() => setFocusOpen(true)} />
        <InlineList label={t('habits.label')} title={t('habits.title')} items={habits} getText={h => h.name} isDone={h => h.completedDate === today} rowClass="habit-row" doneClass="habit-done" onAdd={addHabit} onToggle={toggleHabit} onEdit={editHabit} onDelete={deleteHabit} placeholder={t('habits.placeholder')} empty={t('habits.empty')} maxLength={100} footer={t('habits.footer', { done: habits.filter(h => h.completedDate === today).length, total: habits.length })} />
      </div>
      <div className="dashboard-column dashboard-middle">
        <InlineList label={t('tasks.label')} title={t('tasks.title')} items={tasks} getText={task => task.text} isDone={task => task.completed} sortDone doneClass="task-completed" onAdd={addTask} onToggle={toggleTask} onEdit={editTask} onDelete={deleteTask} placeholder={t('tasks.placeholder')} empty={t('tasks.empty')} maxLength={160} footer={t('tasks.footer', { left: tasks.filter(task => !task.completed).length, done: tasks.filter(task => task.completed).length })} />
        <InlineNote label={t('dump.label')} title={t('dump.title')} value={brainDump} onChange={handleBrainDumpChange} onClear={clearBrainDump} placeholder={t('dump.placeholder')} rows={5} status={brainDumpStatus} />
      </div>
      <div className="dashboard-column dashboard-right">
        <GentlePlan />
        <SoundMixer />
      </div>
    </section>
    <footer className="footer">{t('app.footer')}</footer>
    {focusOpen && <PomodoroDialog onClose={() => setFocusOpen(false)} autoStart />}
    {themeOpen && <ThemeDialog currentTheme={theme} onSelect={chooseTheme} onClose={() => setThemeOpen(false)} />}
    {backgroundOpen && <BackgroundDialog currentBackground={background} onSelect={chooseBackground} onClose={() => setBackgroundOpen(false)} />}
  </main></I18nContext.Provider>
}


createRoot(document.getElementById('root')).render(<App />)
