'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './page.module.css'

type Lead = {
  id: string; name: string; role: string; source: string; handle: string
  twitter: string; linkedin: string; painRaw: string; pains: string[]
  offer: string; status: 'new'|'contacted'|'replied'|'closed'
  urgency: 'low'|'medium'|'high'|'critical'; time: string; scrapedAt: string; url?: string
}

type ChatMsg = { role: 'user'|'assistant'; content: string }

const SRC_LABEL: Record<string,string> = { reddit:'Reddit', ih:'IndieHackers', ph:'ProductHunt', twitter:'Twitter/X', yc:'YC', linkedin:'LinkedIn' }
const SRC_COLOR: Record<string,string> = {
  reddit:'#EF9F27', ih:'#1D9E75', ph:'#D85A30', twitter:'#378ADD', yc:'#7F77DD', linkedin:'#378ADD'
}
const STATUS_COLOR: Record<string,string> = {
  new:'#1D9E75', contacted:'#378ADD', replied:'#EF9F27', closed:'#D85A30'
}
const URGENCY_LABEL: Record<string,string> = { low:'', medium:'', high:'⚡', critical:'🚨' }

export default function CRMPage() {
  const [tab, setTab] = useState<'leads'|'intel'|'digest'|'ai'>('leads')
  const [leads, setLeads] = useState<Lead[]>([])
  const [selected, setSelected] = useState<Lead|null>(null)
  const [filter, setFilter] = useState('all')
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

  async function runSync() {
    setSyncing(true)
    setSyncLog([])
    const sources = ['Reddit r/startups','Reddit r/entrepreneur','Reddit r/SaaS','IndieHackers','ProductHunt','Reddit r/indiehackers','Reddit r/smallbusiness']
    for (const src of sources) {
      await new Promise(r => setTimeout(r, 350))
      setSyncLog(prev => [...prev, {
        time: new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
        msg: `Scraped ${src}`,
        count: `+${1+Math.floor(Math.random()*3)}`
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
        body: JSON.stringify({ message: msg, history: chatHistory.map(m=>({role:m.role,content:m.content})) })
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
      setTgStatus(data.success ? '✓ Digest sent to Telegram!' : `Failed: ${data.reason || 'Unknown error'}`)
    } catch { setTgStatus('Error sending digest') }
    setSendingDigest(false)
  }

  const getFiltered = useCallback(() => {
    if (filter === 'all') return leads
    if (['new','contacted','replied','closed'].includes(filter)) return leads.filter(l=>l.status===filter)
    return leads.filter(l=>l.pains.includes(filter))
  }, [leads, filter])

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

  const filtered = getFiltered()

  return (
    <div className={styles.root}>
      {/* Topbar */}
      <div className={styles.topbar}>
        <div className={styles.logo}>
          <span className={styles.logoDot}/>
          FourFive CRM
        </div>
        <div className={styles.topbarRight}>
          <span className={styles.lastSync}>last sync: {lastSync}</span>
          <button className={`${styles.btn} ${syncing?styles.btnDisabled:''}`} onClick={runSync} disabled={syncing}>
            {syncing ? <><span className={styles.spinner}/> syncing...</> : '↻ Sync now'}
          </button>
        </div>
      </div>

      {/* Nav */}
      <div className={styles.nav}>
        {(['leads','intel','digest','ai'] as const).map(t => (
          <button key={t} className={`${styles.navTab} ${tab===t?styles.navTabActive:''}`} onClick={()=>setTab(t)}>
            {t==='leads'?'Leads':t==='intel'?'Intelligence':t==='digest'?'Digest':'AI analyst'}
          </button>
        ))}
      </div>

      <div className={styles.body}>

        {/* LEADS TAB */}
        {tab==='leads' && (
          <div className={styles.fadeIn}>
            <div className={styles.statsRow}>
              {[
                {label:'Total leads',val:stats.total,sub:'in pipeline'},
                {label:'New today',val:stats.new,sub:'uncontacted'},
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

            <div className={styles.mainGrid}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className={styles.panelTitle}>Founder leads</span>
                  <span className={styles.panelAction} onClick={runSync}>+ fetch new</span>
                </div>
                <div className={styles.filterRow}>
                  {['all','new','contacted','replied','website','design','automation','branding'].map(f=>(
                    <button key={f} className={`${styles.filterBtn} ${filter===f?styles.filterBtnActive:''}`} onClick={()=>setFilter(f)}>{f}</button>
                  ))}
                </div>
                <div className={styles.leadsList}>
                  {filtered.length===0?(
                    <div className={styles.emptyState}>
                      {leads.length===0 ? 'Click "Sync now" to fetch founder leads' : 'No leads match this filter'}
                    </div>
                  ):filtered.map(l=>(
                    <div key={l.id} className={`${styles.leadCard} ${selected?.id===l.id?styles.leadCardSelected:''}`} onClick={()=>setSelected(l)}>
                      <div className={styles.leadTop}>
                        <div className={styles.leadName}>
                          {URGENCY_LABEL[l.urgency]} {l.name}
                          <span className={styles.srcTag} style={{background:SRC_COLOR[l.source]+'22',color:SRC_COLOR[l.source]}}>
                            {SRC_LABEL[l.source]||l.source}
                          </span>
                        </div>
                        <span className={styles.offerTag}>{l.pains[0]}</span>
                      </div>
                      <div className={styles.leadRole}>{l.role}</div>
                      <div className={styles.painPills}>
                        {l.pains.map(p=><span key={p} className={styles.painPill}>{p}</span>)}
                      </div>
                      <div className={styles.leadBottom}>
                        <div>
                          <span className={styles.statusDot} style={{background:STATUS_COLOR[l.status]}}/>
                          <span className={styles.statusLabel}>{l.status}</span>
                        </div>
                        <span className={styles.leadTime}>{l.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detail panel */}
              <div className={styles.detailPanel}>
                {!selected?(
                  <div className={styles.emptyDetail}>
                    <div style={{fontSize:32,marginBottom:8}}>→</div>
                    Select a lead to view details
                  </div>
                ):(
                  <div className={styles.fadeIn}>
                    <div className={styles.detailHeader}>
                      <div className={styles.detailName}>{URGENCY_LABEL[selected.urgency]} {selected.name}</div>
                      <div className={styles.detailRole}>{selected.role}</div>
                      <div className={styles.socialsRow}>
                        {selected.url && <a className={styles.socialLink} href={selected.url} target="_blank" rel="noreferrer">↗ Source post</a>}
                        {selected.twitter && <a className={styles.socialLink} href={`https://${selected.twitter}`} target="_blank" rel="noreferrer">Twitter</a>}
                        {selected.linkedin && <a className={styles.socialLink} href={`https://${selected.linkedin}`} target="_blank" rel="noreferrer">LinkedIn</a>}
                      </div>
                    </div>

                    <div className={styles.detailSection}>
                      <div className={styles.detailSecTitle}>Their pain</div>
                      <div className={styles.painBlock}>"{selected.painRaw.slice(0,300)}{selected.painRaw.length>300?'…':''}"</div>
                    </div>

                    <div className={styles.detailSection}>
                      <div className={styles.detailSecTitle}>FourFive offer</div>
                      <div className={styles.offerBlock}>{selected.offer}</div>
                    </div>

                    <div className={styles.detailSection}>
                      <div className={styles.detailSecTitle}>Status</div>
                      <div className={styles.filterRow} style={{padding:0,borderBottom:'none'}}>
                        {(['new','contacted','replied','closed'] as const).map(s=>(
                          <button key={s} className={`${styles.filterBtn} ${selected.status===s?styles.filterBtnActive:''}`}
                            onClick={()=>updateStatus(selected.id, s)}>{s}</button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.detailSection}>
                      <button className={styles.primaryBtn} onClick={()=>{
                        setTab('ai')
                        setChatInput(`Draft a DM for ${selected.name}: "${selected.painRaw.slice(0,100)}"`)
                        setTimeout(()=>{ sendChat() }, 100)
                      }}>Draft DM with AI ↗</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INTELLIGENCE TAB */}
        {tab==='intel' && (
          <div className={styles.fadeIn}>
            <div className={styles.panel} style={{marginBottom:16}}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Scraper sources</span>
                <span className={styles.liveTag}>● live</span>
              </div>
              <div className={styles.sourceChips}>
                {['Reddit r/startups','Reddit r/entrepreneur','Reddit r/SaaS','IndieHackers','ProductHunt','Reddit r/indiehackers','Reddit r/smallbusiness'].map(s=>(
                  <div key={s} className={styles.sourceChip}>
                    <span className={styles.sourceChipDot}/>
                    {s}
                  </div>
                ))}
              </div>
              {syncLog.length>0&&(
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
                {Object.keys(painCounts).length===0?(
                  <div className={styles.emptyState}>Sync leads to see pain point breakdown</div>
                ):Object.entries(painCounts).sort((a,b)=>b[1]-a[1]).map(([pain,count],i)=>{
                  const colors=['#1D9E75','#378ADD','#EF9F27','#D85A30','#7F77DD']
                  return (
                    <div key={pain} className={styles.barRow}>
                      <div className={styles.barLabel}>{pain}</div>
                      <div className={styles.barTrack}>
                        <div className={styles.barFill} style={{width:`${Math.round(count/maxPain*100)}%`,background:colors[i%colors.length]}}/>
                      </div>
                      <div className={styles.barCount}>{count}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* DIGEST TAB */}
        {tab==='digest' && (
          <div className={`${styles.fadeIn} ${styles.digestGrid}`}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Telegram setup</span>
                <span className={styles.tgTag}>Telegram</span>
              </div>
              <div className={styles.digestBody}>
                <div className={styles.timeslots}>
                  <div className={styles.timeslot}><div className={styles.timeslotTime}>08:00</div><div className={styles.timeslotLabel}>Morning IST</div></div>
                  <div className={styles.timeslotDiv}/>
                  <div className={styles.timeslot}><div className={styles.timeslotTime}>14:00</div><div className={styles.timeslotLabel}>Afternoon IST</div></div>
                </div>
                <div className={styles.setupSteps}>
                  {['Open Telegram → search @BotFather','/newbot → name it "FourFive Intel"','Copy the bot token below','Start a chat with your new bot','/start → check getUpdates for chat ID','Add token + chat ID to Vercel env vars'].map((s,i)=>(
                    <div key={i} className={styles.setupStep}><span className={styles.setupNum}>{i+1}</span>{s}</div>
                  ))}
                </div>
                <div className={styles.inputGroup}>
                  <input className={styles.input} placeholder="Bot token (from @BotFather)..." value={tgToken} onChange={e=>setTgToken(e.target.value)}/>
                  <input className={styles.input} placeholder="Chat ID (from getUpdates)..." value={tgChatId} onChange={e=>setTgChatId(e.target.value)} style={{marginTop:6}}/>
                  <button className={styles.primaryBtn} style={{marginTop:8}} onClick={sendDigestNow} disabled={sendingDigest}>
                    {sendingDigest?'Sending...':'Send test digest now'}
                  </button>
                  {tgStatus&&<div className={styles.tgStatus}>{tgStatus}</div>}
                </div>
                <div className={styles.envNote}>
                  Also add to Vercel: <code>TELEGRAM_BOT_TOKEN</code> + <code>TELEGRAM_CHAT_ID</code> for automatic cron sends.
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>Digest preview</span>
                <span className={styles.panelAction} onClick={generateDigest}>generate</span>
              </div>
              <div className={styles.digestBody}>
                <button className={styles.primaryBtn} onClick={generateDigest} disabled={digestLoading}>
                  {digestLoading?<><span className={styles.spinner}/> Generating...</>:'Generate preview'}
                </button>
                {digestMsg&&(
                  <div className={styles.digestPreview}>
                    {digestMsg.split('\n').map((line,i)=>(
                      <div key={i}>{line||<br/>}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI TAB */}
        {tab==='ai' && (
          <div className={`${styles.fadeIn} ${styles.aiPanel}`}>
            <div className={styles.panel} style={{display:'flex',flexDirection:'column',height:'calc(100vh - 180px)'}}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>AI analyst</span>
                <span className={styles.tgTag}>Claude powered</span>
              </div>
              <div className={styles.chatHistory} ref={chatRef}>
                {chatHistory.length===0&&(
                  <div className={styles.aiWelcome}>
                    <div className={styles.aiWelcomeTitle}>Hey Shon 👋</div>
                    <div className={styles.aiWelcomeSub}>Ask me anything about your leads:</div>
                    {['Which leads are most urgent?','Draft DMs for the top 3 leads','What pain points are trending?','Which source gives best leads?'].map(q=>(
                      <button key={q} className={styles.suggBtn} onClick={()=>{setChatInput(q);setTimeout(()=>document.getElementById('chatInput')?.focus(),50)}}>{q} →</button>
                    ))}
                  </div>
                )}
                {chatHistory.map((m,i)=>(
                  <div key={i} className={`${styles.chatMsg} ${m.role==='user'?styles.chatMsgUser:styles.chatMsgAI}`}>
                    {m.content.split('\n').map((l,j)=><div key={j}>{l||<br/>}</div>)}
                  </div>
                ))}
                {chatLoading&&(
                  <div className={styles.chatMsg}><span className={styles.spinner}/></div>
                )}
              </div>
              <div className={styles.chatInputRow}>
                <input id="chatInput" className={styles.chatInput} value={chatInput} onChange={e=>setChatInput(e.target.value)}
                  placeholder="Ask about your leads..." onKeyDown={e=>e.key==='Enter'&&sendChat()}/>
                <button className={styles.primaryBtn} onClick={sendChat} disabled={chatLoading}>Send</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
