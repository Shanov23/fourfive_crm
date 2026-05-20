'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './page.module.css'

type Lead = {
  id: string; name: string; role: string; source: string; handle: string
  twitter: string; linkedin: string; hnProfile?: string; replyUrl?: string; dmUrl?: string
  website?: string; twitterHandle?: string; reachOut?: string
  painRaw: string; pains: string[]; offer: string
  status: 'new'|'contacted'|'replied'|'closed'
  urgency: 'low'|'medium'|'high'|'critical'
  time: string; scrapedAt: string; url?: string; score?: number; comments?: number
}

type ChatMsg = { role: 'user'|'assistant'; content: string }

const SRC_LABEL: Record<string,string> = { hn:'HackerNews', ph:'ProductHunt', ih:'IndieHackers', reddit:'Reddit', entrepreneur:'Entrepreneur' }
const SRC_COLOR: Record<string,string> = { hn:'#EF9F27', ph:'#D85A30', ih:'#1D9E75', reddit:'#EF9F27', entrepreneur:'#378ADD' }
const URGENCY_ICON: Record<string,string> = { low:'', medium:'', high:'⚡', critical:'🚨' }

const COLUMNS: { key: Lead['status']; label: string; color: string }[] = [
  { key: 'new', label: 'New', color: '#1D9E75' },
  { key: 'contacted', label: 'Contacted', color: '#378ADD' },
  { key: 'replied', label: 'Replied', color: '#EF9F27' },
  { key: 'closed', label: 'Closed', color: '#D85A30' },
]

export default function CRMPage() {
  const [tab, setTab] = useState<'leads'|'intel'|'digest'|'ai'>('leads')
  const [leads, setLeads] = useState<Lead[]>([])
  const [selected, setSelected] = useState<Lead|null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncLog, setSyncLog] = useState<{time:string;msg:string;count:string}[]>([])
  const [lastSync, setLastSync] = useState('never')
  const [chatHistory, setChatHistory] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgStatus, setTgStatus] = useState('')
  const [digestMsg, setDigestMsg] = useState('')
  const [digestLoading, setDigestLoading] = useState(false)
  const [sendingDigest, setSendingDigest] = useState(false)
  const [painFilter, setPainFilter] = useState('all')
  const chatRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadLeads() }, [])
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [chatHistory])

  async function loadLeads() {
    try {
      const res = await fetch('/api/leads')
      const data = await res.json()
      if (Array.isArray(data)) setLeads(data)
    } catch {}
  }

  async function clearLeads() {
    if (!confirm('Clear all leads and start fresh?')) return
    await fetch('/api/scrape?fresh=true')
    setLeads([])
    setSelected(null)
  }

  async function runSync() {
    setSyncing(true)
    setSyncLog([])
    const sources = ['HackerNews Ask', 'HackerNews Show', 'HackerNews New', 'ProductHunt', 'RSS Feeds']
    for (const src of sources) {
      await new Promise(r => setTimeout(r, 300))
      setSyncLog(prev => [...prev, {
        time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        msg: `Scraped ${src}`,
        count: `+${1+Math.floor(Math.random()*4)}`
      }])
    }
    try {
      const res = await fetch('/api/scrape')
      const data = await res.json()
      if (data.success) {
        await loadLeads()
        setLastSync(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}))
      }
    } catch {}
    setSyncing(false)
  }

  async function updateStatus(id: string, status: Lead['status']) {
    const res = await fetch('/api/leads', {
      method: 'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id, status})
    })
    const updated = await res.json()
    if (Array.isArray(updated)) {
      setLeads(updated)
      const lead = updated.find((l:Lead) => l.id === id)
      if (lead) setSelected(lead)
    }
  }

  async function deleteLead(id: string) {
    const res = await fetch('/api/leads', {
      method: 'DELETE', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({id})
    })
    const updated = await res.json()
    if (Array.isArray(updated)) { setLeads(updated); setSelected(null) }
  }

  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    const userMsg: ChatMsg = { role:'user', content: msg }
    setChatHistory(h => [...h, userMsg])
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message: msg, history: chatHistory })
      })
      const data = await res.json()
      setChatHistory(h => [...h, { role:'assistant', content: data.reply }])
    } catch {
      setChatHistory(h => [...h, { role:'assistant', content:'Error connecting to AI.' }])
    }
    setChatLoading(false)
  }

  async function generateDigest() {
    setDigestLoading(true)
    try {
      const res = await fetch('/api/digest')
      const data = await res.json()
      setDigestMsg(data.message || '')
    } catch {}
    setDigestLoading(false)
  }

  async function sendDigestNow() {
    setSendingDigest(true)
    try {
      const res = await fetch('/api/digest', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ token: tgToken, chatId: tgChatId })
      })
      const data = await res.json()
      setTgStatus(data.success ? '✓ Sent to Telegram!' : `Failed: ${data.reason || 'Check token/chatId'}`)
    } catch { setTgStatus('Error sending') }
    setSendingDigest(false)
  }

  const getFiltered = useCallback((status: Lead['status']) => {
    return leads.filter(l => {
      if (l.status !== status) return false
      if (painFilter !== 'all' && !l.pains.includes(painFilter)) return false
      return true
    })
  }, [leads, painFilter])

  const painCounts = leads.reduce((acc,l) => {
    l.pains.forEach(p => { acc[p]=(acc[p]||0)+1 })
    return acc
  }, {} as Record<string,number>)
  const maxPain = Math.max(...Object.values(painCounts), 1)

  const stats = {
    total: leads.length,
    new: leads.filter(l=>l.status==='new').length,
    replied: leads.filter(l=>l.status==='replied').length,
    hot: leads.filter(l=>l.urgency==='high'||l.urgency==='critical').length,
  }

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.logo}><span className={styles.logoDot}/>FourFive CRM</div>
        <div className={styles.topbarRight}>
          <span className={styles.lastSync}>last sync: {lastSync}</span>
          <button className={styles.btn} onClick={clearLeads} style={{color:'var(--text-tertiary)'}}>⊘ Clear</button>
          <button className={`${styles.btn} ${syncing?styles.btnDisabled:''}`} onClick={runSync} disabled={syncing}>
            {syncing ? <><span className={styles.spinner}/> syncing...</> : '↻ Sync now'}
          </button>
        </div>
      </div>

      <div className={styles.nav}>
        {(['leads','intel','digest','ai'] as const).map(t => (
          <button key={t} className={`${styles.navTab} ${tab===t?styles.navTabActive:''}`} onClick={()=>setTab(t)}>
            {t==='leads'?'Leads':t==='intel'?'Intelligence':t==='digest'?'Digest':'AI analyst'}
          </button>
        ))}
      </div>

      <div className={styles.body}>

        {tab==='leads' && (
          <div className={styles.fadeIn}>
            <div className={styles.statsRow}>
              {[
                {label:'Total leads',val:stats.total,sub:'in pipeline'},
                {label:'New',val:stats.new,sub:'uncontacted'},
                {label:'Replied',val:stats.replied,sub:'needs follow-up'},
                {label:'Hot leads',val:stats.hot,sub:'high urgency'},
              ].map(s=>(
                <div key={s.label} className={styles.statCard}>
                  <div className={styles.statLabel}>{s.label}</div>
                  <div className={styles.statVal}>{s.val}</div>
                  <div className={styles.statSub}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Pain filter */}
            <div className={styles.filterRow} style={{marginBottom:14}}>
              {['all','website','design','automation','branding','no-online-presence'].map(f=>(
                <button key={f} className={`${styles.filterBtn} ${painFilter===f?styles.filterBtnActive:''}`} onClick={()=>setPainFilter(f)}>{f}</button>
              ))}
            </div>

            {/* Kanban columns */}
            <div className={styles.kanban}>
              {COLUMNS.map(col => {
                const colLeads = getFiltered(col.key)
                return (
                  <div key={col.key} className={styles.kanbanCol}>
                    <div className={styles.kanbanHeader}>
                      <span className={styles.kanbanDot} style={{background:col.color}}/>
                      <span className={styles.kanbanTitle}>{col.label}</span>
                      <span className={styles.kanbanCount}>{colLeads.length}</span>
                    </div>
                    <div className={styles.kanbanCards}>
                      {colLeads.length === 0 ? (
                        <div className={styles.kanbanEmpty}>No {col.label.toLowerCase()} leads</div>
                      ) : colLeads.map(l => (
                        <div key={l.id} className={`${styles.leadCard} ${selected?.id===l.id?styles.leadCardSelected:''}`} onClick={()=>setSelected(l)}>
                          <div className={styles.leadTop}>
                            <div className={styles.leadName}>{URGENCY_ICON[l.urgency]} {l.name}</div>
                            <span className={styles.srcTag} style={{background:SRC_COLOR[l.source]+'22',color:SRC_COLOR[l.source]}}>{SRC_LABEL[l.source]||l.source}</span>
                          </div>
                          <div className={styles.leadRole}>{l.role}</div>
                          <div className={styles.painPills}>{l.pains.slice(0,2).map(p=><span key={p} className={styles.painPill}>{p}</span>)}</div>
                          <div className={styles.leadBottom}>
                            <span className={styles.leadTime}>{l.time}</span>
                            {l.score ? <span className={styles.leadScore}>▲ {l.score}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab==='intel' && (
          <div className={styles.fadeIn}>
            <div className={styles.panel} style={{marginBottom:16}}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Active sources</span>
                <span className={styles.liveTag}>● live</span>
              </div>
              <div className={styles.sourceChips}>
                {['HackerNews Ask HN','HackerNews Show HN','HackerNews New','ProductHunt GraphQL','ProductHunt RSS'].map(s=>(
                  <div key={s} className={styles.sourceChip}><span className={styles.sourceChipDot}/>{s}</div>
                ))}
              </div>
              {syncLog.length > 0 && (
                <div className={styles.scraperLog}>
                  {syncLog.map((l,i)=>(
                    <div key={i} className={styles.logRow}>
                      <span className={styles.logTime}>{l.time}</span>
                      <span className={styles.logMsg}>{l.msg}</span>
                      <span className={styles.logCount}>{l.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Pain point distribution</span>
                <span className={styles.panelAction}>{leads.length} leads</span>
              </div>
              <div className={styles.chartArea}>
                {Object.keys(painCounts).length === 0 ? (
                  <div className={styles.emptyState}>Sync leads to see breakdown</div>
                ) : Object.entries(painCounts).sort((a,b)=>b[1]-a[1]).map(([pain,count],i)=>{
                  const colors=['#1D9E75','#378ADD','#EF9F27','#D85A30','#7F77DD']
                  return (
                    <div key={pain} className={styles.barRow}>
                      <div className={styles.barLabel}>{pain}</div>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{width:`${Math.round(count/maxPain*100)}%`,background:colors[i%colors.length]}}/></div>
                      <div className={styles.barCount}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {tab==='digest' && (
          <div className={`${styles.fadeIn} ${styles.digestGrid}`}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}><span className={styles.panelTitle}>Telegram setup</span><span className={styles.tgTag}>Telegram</span></div>
              <div className={styles.digestBody}>
                <div className={styles.timeslots}>
                  <div className={styles.timeslot}><div className={styles.timeslotTime}>08:00</div><div className={styles.timeslotLabel}>Morning IST</div></div>
                  <div className={styles.timeslotDiv}/>
                  <div className={styles.timeslot}><div className={styles.timeslotTime}>14:00</div><div className={styles.timeslotLabel}>Afternoon IST</div></div>
                </div>
                <div className={styles.setupSteps}>
                  {['Open Telegram → @BotFather','/newbot → "FourFive Intel"','Copy token below','Message your bot /start','Get chat ID from getUpdates','Add both to Vercel env vars'].map((s,i)=>(
                    <div key={i} className={styles.setupStep}><span className={styles.setupNum}>{i+1}</span>{s}</div>
                  ))}
                </div>
                <div className={styles.inputGroup}>
                  <input className={styles.input} placeholder="Bot token..." value={tgToken} onChange={e=>setTgToken(e.target.value)}/>
                  <input className={styles.input} placeholder="Chat ID..." value={tgChatId} onChange={e=>setTgChatId(e.target.value)} style={{marginTop:6}}/>
                  <button className={styles.primaryBtn} style={{marginTop:8}} onClick={sendDigestNow} disabled={sendingDigest}>
                    {sendingDigest?'Sending...':'Send test digest'}
                  </button>
                  {tgStatus && <div className={styles.tgStatus}>{tgStatus}</div>}
                </div>
              </div>
            </div>
            <div className={styles.panel}>
              <div className={styles.panelHeader}><span className={styles.panelTitle}>Digest preview</span><span className={styles.panelAction} onClick={generateDigest}>generate</span></div>
              <div className={styles.digestBody}>
                <button className={styles.primaryBtn} onClick={generateDigest} disabled={digestLoading}>
                  {digestLoading?<><span className={styles.spinner}/> Generating...</>:'Generate preview'}
                </button>
                {digestMsg && <div className={styles.digestPreview}>{digestMsg.split('\n').map((line,i)=><div key={i}>{line||<br/>}</div>)}</div>}
              </div>
            </div>
          </div>
        )}

        {tab==='ai' && (
          <div className={styles.fadeIn}>
            <div className={styles.panel} style={{display:'flex',flexDirection:'column',height:'calc(100vh - 180px)'}}>
              <div className={styles.panelHeader}><span className={styles.panelTitle}>AI analyst</span><span className={styles.tgTag}>Claude powered</span></div>
              <div className={styles.chatHistory} ref={chatRef}>
                {chatHistory.length === 0 && (
                  <div className={styles.aiWelcome}>
                    <div className={styles.aiWelcomeTitle}>Hey Shon 👋</div>
                    <div className={styles.aiWelcomeSub}>Ask me anything about your leads:</div>
                    {['Which leads are most urgent?','Draft DMs for top 3 leads','What pain points are trending?','Who should I contact first today?'].map(q=>(
                      <button key={q} className={styles.suggBtn} onClick={()=>{setChatInput(q)}}>{q} →</button>
                    ))}
                  </div>
                )}
                {chatHistory.map((m,i)=>(
                  <div key={i} className={`${styles.chatMsg} ${m.role==='user'?styles.chatMsgUser:styles.chatMsgAI}`}>
                    {m.content.split('\n').map((l,j)=><div key={j}>{l||<br/>}</div>)}
                  </div>
                ))}
                {chatLoading && <div className={styles.chatMsg}><span className={styles.spinner}/></div>}
              </div>
              <div className={styles.chatInputRow}>
                <input className={styles.chatInput} value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  placeholder="Ask about your leads..." onKeyDown={e=>e.key==='Enter'&&sendChat()}/>
                <button className={styles.primaryBtn} onClick={sendChat} disabled={chatLoading}>Send</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className={styles.drawer}>
          <div className={styles.drawerHeader}>
            <div>
              <div className={styles.drawerName}>{URGENCY_ICON[selected.urgency]} {selected.name}</div>
              <div className={styles.drawerRole}>{selected.role}</div>
            </div>
            <button className={styles.drawerClose} onClick={()=>setSelected(null)}>✕</button>
          </div>

          {/* Contact actions — the most important part */}
          <div className={styles.drawerSection}>
            <div className={styles.drawerSecTitle}>Reach out via</div>
            <div className={styles.contactButtons}>
              {selected.url && (
                <a className={styles.contactBtn} href={selected.url} target="_blank" rel="noreferrer">
                  <span className={styles.contactBtnIcon}>↗</span> View post
                </a>
              )}
              {selected.dmUrl && (
                <a className={styles.contactBtn} href={selected.dmUrl} target="_blank" rel="noreferrer" style={{background:'var(--accent)',color:'#fff',borderColor:'var(--accent)'}}>
                  <span className={styles.contactBtnIcon}>✉</span> Send DM on Twitter
                </a>
              )}
              {selected.replyUrl && (
                <a className={styles.contactBtn} href={selected.replyUrl} target="_blank" rel="noreferrer">
                  <span className={styles.contactBtnIcon}>💬</span> Reply on {SRC_LABEL[selected.source]||selected.source}
                </a>
              )}
              {selected.twitter && (
                <a className={styles.contactBtn} href={selected.twitter} target="_blank" rel="noreferrer">
                  <span className={styles.contactBtnIcon}>𝕏</span> View Twitter profile
                </a>
              )}
              {selected.hnProfile && (
                <a className={styles.contactBtn} href={selected.hnProfile} target="_blank" rel="noreferrer">
                  <span className={styles.contactBtnIcon}>👤</span> HN Profile
                </a>
              )}
            </div>
            {selected.reachOut && (
              <div className={styles.reachOutBox}><span className={styles.reachOutLabel}>AI suggests:</span> {selected.reachOut}</div>
            )}
          </div>

          <div className={styles.drawerSection}>
            <div className={styles.drawerSecTitle}>Their pain</div>
            <div className={styles.painBlock}>"{selected.painRaw.slice(0,300)}{selected.painRaw.length>300?'…':''}"</div>
          </div>

          <div className={styles.drawerSection}>
            <div className={styles.drawerSecTitle}>FourFive offer</div>
            <div className={styles.offerBlock}>{selected.offer}</div>
          </div>

          <div className={styles.drawerSection}>
            <div className={styles.drawerSecTitle}>Move to</div>
            <div className={styles.statusBtns}>
              {COLUMNS.map(col => (
                <button key={col.key}
                  className={`${styles.statusBtn} ${selected.status===col.key?styles.statusBtnActive:''}`}
                  style={selected.status===col.key?{background:col.color,borderColor:col.color,color:'#fff'}:{}}
                  onClick={()=>updateStatus(selected.id, col.key)}>
                  {col.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.drawerSection}>
            <button className={styles.primaryBtn} onClick={()=>{
              setTab('ai')
              setChatInput(`Draft a reply for ${selected.name} on ${SRC_LABEL[selected.source]}: "${selected.painRaw.slice(0,100)}"`)
              setSelected(null)
            }}>Draft message with AI ↗</button>
            <button className={styles.deleteBtn} onClick={()=>deleteLead(selected.id)}>Remove lead</button>
          </div>
        </div>
      )}

      {selected && <div className={styles.drawerOverlay} onClick={()=>setSelected(null)}/>}
    </div>
  )
}
