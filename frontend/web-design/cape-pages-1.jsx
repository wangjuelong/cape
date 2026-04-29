/* global React, CAPE_DATA, Icon, PageHead, ScoreBadge */
const { useState: useState1, useMemo: useMemo1 } = React;

// ===================== DASHBOARD =====================
function PageDashboard() {
  const D = window.CAPE_DATA.dashboard;
  return (
    <>
      <PageHead crumbs={['CAPE','Dashboard']} actions={
        <>
          <button className="btn">{Icon.refresh}<span>Refresh</span></button>
          <button className="btn primary">{Icon.upload}<span>New analysis</span></button>
        </>
      }/>
      <div className="scroll" style={{padding:14}}>
        {/* row 1: stat tiles */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:10, marginBottom:14}}>
          <div className="stat"><div className="label">Total reports</div><div className="val">184,729</div><div className="delta up">▲ 1,028 / 24h</div></div>
          <div className="stat"><div className="label">Pending queue</div><div className="val" style={{color:'var(--sev-med)'}}>{D.queue.pending}</div><div className="delta">est. wait 4m 12s</div></div>
          <div className="stat"><div className="label">Running</div><div className="val" style={{color:'var(--accent)'}}>{D.queue.running}</div><div className="delta">avg 5m 18s</div></div>
          <div className="stat"><div className="label">Failed (24h)</div><div className="val" style={{color:'var(--sev-crit)'}}>{D.queue.failed}</div><div className="delta down">▲ 4 vs prev</div></div>
          <div className="stat"><div className="label">Malicious rate</div><div className="val">38.4%</div><div className="delta">last 24h · 1,028 samples</div></div>
          <div className="stat"><div className="label">Throughput</div><div className="val">42<span className="dim" style={{fontSize:12,marginLeft:4}}>/h</span></div>
            <div className="spark" style={{marginTop:'auto'}}>
              {D.throughput.map((v,i)=>(<i key={i} style={{height:`${v*1.2}%`}}/>))}
            </div>
          </div>
        </div>

        {/* row 2 */}
        <div style={{display:'grid', gridTemplateColumns:'2fr 1.2fr 1.2fr', gap:10, marginBottom:14}}>
          {/* Live tasks */}
          <div className="panel">
            <div className="panel-h">Live tasks <span className="count">· 4 running · 7 pending</span>
              <div className="actions"><button className="btn ghost" style={{height:22, fontSize:11}}>view all →</button></div>
            </div>
            <table className="data">
              <thead><tr>
                <th style={{width:60}}>ID</th><th>Target</th><th style={{width:90}}>Family</th>
                <th style={{width:120}}>Status</th><th style={{width:140}}>Progress</th><th style={{width:80}}>Score</th>
              </tr></thead>
              <tbody>
                {window.CAPE_DATA.recent.slice(0,7).map((t,i) => {
                  const running = t.status === 'running';
                  const pending = t.status === 'pending';
                  const pct = running ? 64 : pending ? 0 : 100;
                  return (
                    <tr key={t.id} className={i===0?'sel':''}>
                      <td className="mono" style={{color:'var(--accent)'}}>#{t.id}</td>
                      <td style={{color:'var(--fg-0)'}}>{t.target}</td>
                      <td>{t.family !== '—' ? <span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':'med')}>{t.family}</span> : <span className="dim">—</span>}</td>
                      <td>{
                        running ? <span style={{color:'var(--accent)'}}>● running</span> :
                        pending ? <span style={{color:'var(--sev-med)'}}>○ pending</span> :
                        <span style={{color:'var(--sev-clean)'}}>✓ reported</span>
                      }</td>
                      <td>
                        <div className="prog" style={{width:120}}><i style={{width:`${pct}%`}}/></div>
                      </td>
                      <td>{t.status==='reported' ? <span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':t.score>=3?'med':t.score>=1?'low':'clean')}>{t.score.toFixed(1)}</span> : <span className="dim">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Machines */}
          <div className="panel">
            <div className="panel-h">Analysis machines <span className="count">· 7</span></div>
            <div style={{padding:'4px 0'}}>
              {D.machines.map(m=>(
                <div key={m.name} style={{display:'grid', gridTemplateColumns:'10px 1fr auto', gap:10, padding:'7px 12px', alignItems:'center', borderBottom:'1px solid var(--border)'}}>
                  <span style={{width:8, height:8, borderRadius:'50%',
                    background: m.state==='busy'?'var(--accent)':m.state==='idle'?'var(--sev-clean)':'var(--sev-med)',
                    boxShadow: m.state==='busy'?'0 0 6px var(--accent)':'none'}}/>
                  <div>
                    <div className="mono" style={{color:'var(--fg-0)', fontSize:12}}>{m.name}</div>
                    <div className="mono dim" style={{fontSize:10.5}}>{m.os} · {m.state}{m.task?` · #${m.task}`:''}</div>
                  </div>
                  <span className="mono dim" style={{fontSize:11}}>{m.since}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Family distribution */}
          <div className="panel">
            <div className="panel-h">Families · last 24h <span className="count">· 408 samples</span></div>
            <div style={{padding:'8px 12px'}}>
              {D.families24h.map(f=>{
                const max = D.families24h[0].count;
                return (
                  <div key={f.name} style={{display:'grid', gridTemplateColumns:'120px 1fr 36px', gap:8, alignItems:'center', padding:'4px 0'}}>
                    <span className="mono" style={{fontSize:11.5, color:'var(--fg-1)'}}>{f.name}</span>
                    <div className="prog" style={{height:6}}><i style={{width:`${(f.count/max)*100}%`, background:`var(--sev-${f.color})`}}/></div>
                    <span className="mono dim" style={{textAlign:'right', fontSize:11}}>{f.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* row 3 — recent reports + signature feed */}
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:10}}>
          <div className="panel">
            <div className="panel-h">Recent reports <span className="count">· top 8 by score</span></div>
            <table className="data">
              <thead><tr>
                <th style={{width:50}}><input type="checkbox" className="chk"/></th>
                <th style={{width:60}}>ID</th><th>Target</th><th style={{width:80}}>Pkg</th>
                <th style={{width:90}}>Family</th><th style={{width:60}}>Score</th>
                <th style={{width:80}}>VT</th><th style={{width:70}}>Sigs</th><th style={{width:80}}>Time</th>
              </tr></thead>
              <tbody>
                {window.CAPE_DATA.recent.filter(r=>r.status==='reported').slice(0,8).map(t=>(
                  <tr key={t.id}>
                    <td><input type="checkbox" className="chk"/></td>
                    <td className="mono" style={{color:'var(--accent)'}}>#{t.id}</td>
                    <td style={{color:'var(--fg-0)'}}>{t.target}</td>
                    <td><span className="tag">{t.pkg}</span></td>
                    <td>{t.family!=='—'?<span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':'med')}>{t.family}</span>:<span className="dim">—</span>}</td>
                    <td><span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':t.score>=3?'med':t.score>=1?'low':'clean')}>{t.score.toFixed(1)}</span></td>
                    <td className={t.vt!=='—' && parseInt(t.vt)>20?'mono':''} style={{color: t.vt!=='—' && parseInt(t.vt)>20?'var(--sev-crit)':'var(--fg-2)'}}>{t.vt}</td>
                    <td className="mono">{t.sigs}</td>
                    <td className="mono dim">{t.added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-h">Top signatures · 24h</div>
            <div className="lane-scroll" style={{maxHeight:340}}>
              {[
                {sev:'crit', n:'Detected Qakbot banking trojan', c:48},
                {sev:'crit', n:'Process injection (NtMapViewOfSection)', c:62},
                {sev:'crit', n:'Detected Cobalt Strike beacon', c:18},
                {sev:'high', n:'Persistence via Registry Run key', c:84},
                {sev:'high', n:'Anti-VM checks via CPUID', c:71},
                {sev:'high', n:'Modifies Windows Defender exclusions', c:34},
                {sev:'med',  n:'Reads installed software list', c:118},
                {sev:'med',  n:'Creates scheduled task', c:52},
              ].map((s,i)=>(
                <div key={i} className={'sig-row '+s.sev}>
                  <div className="bar"/>
                  <div>
                    <div className="ttl">{s.n}</div>
                    <div className="desc"><span className="mono">{s.c}</span> samples · <span className={'tag '+s.sev} style={{height:14, fontSize:9.5}}>{s.sev.toUpperCase()}</span></div>
                  </div>
                  <span className="mono dim" style={{fontSize:11}}>{Icon.chevR}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
window.PageDashboard = PageDashboard;

// ===================== SUBMIT =====================
function PageSubmit() {
  const [mode, setMode] = useState1('file');
  return (
    <>
      <PageHead crumbs={['CAPE','Submit']} actions={
        <>
          <button className="btn">{Icon.doc}<span>API equivalent</span></button>
          <button className="btn primary">{Icon.play}<span>Submit & analyze</span></button>
        </>
      }/>
      <div className="scroll" style={{padding:14}}>
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14}}>
          {/* LEFT: target */}
          <div>
            <div className="panel">
              <div className="panel-h">Target</div>
              <div style={{padding:14}}>
                <div className="tabs" style={{margin:'-14px -14px 14px', height:32}}>
                  {[
                    {k:'file',label:'File',ico:Icon.upload},
                    {k:'url',label:'URL',ico:Icon.ext},
                    {k:'hash',label:'Re-submit by hash',ico:Icon.tag},
                    {k:'static',label:'Static only',ico:Icon.doc},
                  ].map(t=>(
                    <div key={t.k} className={'tab'+(mode===t.k?' active':'')} onClick={()=>setMode(t.k)}>
                      {t.ico}<span>{t.label}</span>
                    </div>
                  ))}
                </div>

                {mode==='file' && (
                  <div className="dropzone">
                    <div style={{fontSize:24, color:'var(--fg-2)', marginBottom:8}}>{Icon.upload}</div>
                    <div style={{fontSize:13, color:'var(--fg-0)', marginBottom:4}}>Drop files here or <span style={{color:'var(--accent)', textDecoration:'underline'}}>browse</span></div>
                    <div className="dim" style={{fontSize:11}}>PE, DLL, MSI, ZIP, Office, PDF, JS, scripts… up to 100 MB</div>
                    <div style={{marginTop:14, padding:8, background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:3, textAlign:'left'}}>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <span style={{width:32, height:32, background:'var(--bg-3)', borderRadius:3, display:'grid', placeItems:'center', fontFamily:'var(--mono)', fontSize:10, color:'var(--fg-2)'}}>EXE</span>
                        <div style={{flex:1, textAlign:'left'}}>
                          <div className="mono" style={{fontSize:12, color:'var(--fg-0)'}}>invoice_oct_2026.docx.exe</div>
                          <div className="mono dim" style={{fontSize:10.5}}>476.0 KB · sha256: b4a9c5e2…d8f1</div>
                        </div>
                        <span className="tag">PE32</span>
                        <button className="icon-btn">×</button>
                      </div>
                    </div>
                  </div>
                )}
                {mode==='url' && (
                  <input className="mono" placeholder="https://..." style={{width:'100%', height:36, padding:'0 12px', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)', borderRadius:3, fontSize:12}}/>
                )}
              </div>
            </div>

            <div className="panel" style={{marginTop:14}}>
              <div className="panel-h">Routing & environment</div>
              <div style={{padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', rowGap:14, columnGap:14}}>
                <Field label="Machine">
                  <Select value="auto" options={['auto','win10x64-22h2-cape03','win10x64-22h2-cape04','win11x64-23h2-cape01','ubuntu-cape01']}/>
                </Field>
                <Field label="Package">
                  <Select value="exe" options={['exe','dll','doc','docx','pdf','msi','xls','js','vbs','ps1','zip','url']}/>
                </Field>
                <Field label="Timeout (s)">
                  <input className="mono" defaultValue={200} style={inputStyle}/>
                </Field>
                <Field label="Priority">
                  <Select value="medium" options={['low','medium','high']}/>
                </Field>
                <Field label="Network route">
                  <Select value="internet" options={['internet','tor','vpn-us-east','vpn-eu-west','none (drop)']}/>
                </Field>
                <Field label="Tags">
                  <div style={{...inputStyle, display:'flex', alignItems:'center', gap:6, padding:'4px 6px'}}>
                    <span className="tag accent">campaign:bb13</span>
                    <span className="tag accent">analyst:akow</span>
                    <span className="dim mono" style={{fontSize:11}}>+ add</span>
                  </div>
                </Field>
              </div>
            </div>
          </div>

          {/* RIGHT: options */}
          <div className="panel">
            <div className="panel-h">Analysis options</div>
            <div style={{padding:14}}>
              <SectionTitle>Monitor & Hooking</SectionTitle>
              <Toggle label="Enable behavioral monitor" def={true}/>
              <Toggle label="Hook NTDLL syscalls" def={true}/>
              <Toggle label="Use direct syscall countermeasures" def={false}/>
              <Toggle label="Capture screenshots" def={true}/>
              <Toggle label="Inject simulated user input" def={true}/>

              <SectionTitle>Dumping & Payloads</SectionTitle>
              <Toggle label="CAPE auto-extraction (config + payloads)" def={true}/>
              <Toggle label="Memory dump full process" def={false}/>
              <Toggle label="Dump on API call" def={false}/>
              <div style={{marginLeft:24, marginTop:4}}>
                <input className="mono" placeholder="dump-on-api=DnsQuery_A" style={{...inputStyle, fontSize:11}}/>
              </div>

              <SectionTitle>Debugger</SectionTitle>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                <input className="mono" placeholder="bp0=0x401000" style={inputStyle}/>
                <input className="mono" placeholder="bp1=ep" style={inputStyle}/>
              </div>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8}}>
                <input className="mono" placeholder="count=200" style={inputStyle}/>
                <input className="mono" placeholder="depth=2" style={inputStyle}/>
              </div>

              <SectionTitle>Free-form options</SectionTitle>
              <textarea className="mono" defaultValue="procdump=1,evtx=1,human=1" style={{...inputStyle, height:60, padding:'8px 10px', resize:'vertical'}}/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const inputStyle = {height:28, padding:'0 10px', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)', borderRadius:3, fontSize:12, fontFamily:'var(--mono)', width:'100%'};
function Field({ label, children }) {
  return <div><div className="mono" style={{fontSize:10.5, color:'var(--fg-2)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4}}>{label}</div>{children}</div>;
}
function Select({ value, options }) {
  return (
    <select defaultValue={value} style={{...inputStyle, fontFamily:'var(--mono)'}}>
      {options.map(o=><option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Toggle({ label, def }) {
  const [on, setOn] = useState1(!!def);
  return (
    <label style={{display:'flex', alignItems:'center', gap:10, padding:'5px 0', cursor:'pointer'}}>
      <span style={{width:28, height:16, background: on?'var(--accent)':'var(--bg-3)', borderRadius:8, position:'relative', transition:'all .15s'}}
            onClick={()=>setOn(!on)}>
        <span style={{position:'absolute', width:12, height:12, top:2, left: on?14:2, background:'#fff', borderRadius:6, transition:'all .15s'}}/>
      </span>
      <span style={{fontSize:12, color:'var(--fg-0)'}}>{label}</span>
    </label>
  );
}
function SectionTitle({ children }) {
  return <div style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--fg-2)', fontWeight:600, margin:'14px 0 6px', borderBottom:'1px solid var(--border)', paddingBottom:4}}>{children}</div>;
}

window.PageSubmit = PageSubmit;

// ===================== RECENT =====================
function PageRecent({ onOpen }) {
  return (
    <>
      <PageHead crumbs={['CAPE','Recent']} actions={
        <>
          <button className="btn">{Icon.filter}Filters · 2</button>
          <button className="btn">{Icon.download}Export CSV</button>
          <button className="btn primary">{Icon.upload}New analysis</button>
        </>
      }/>
      <div style={{display:'flex', flexDirection:'column', height:'100%'}}>
        {/* filter chips bar */}
        <div style={{padding:'8px 14px', borderBottom:'1px solid var(--border)', background:'var(--bg-1)', display:'flex', gap:6, alignItems:'center', fontSize:12}}>
          <span className="dim mono" style={{fontSize:11, marginRight:4}}>FILTER:</span>
          <span className="tag accent">status:reported</span>
          <span className="tag accent">score:≥7</span>
          <span className="tag" style={{cursor:'pointer'}}>+ family</span>
          <span className="tag" style={{cursor:'pointer'}}>+ machine</span>
          <span className="tag" style={{cursor:'pointer'}}>+ tag</span>
          <span className="tag" style={{cursor:'pointer'}}>+ date</span>
          <div style={{flex:1}}/>
          <span className="dim mono" style={{fontSize:11}}>showing 14 of 184,729</span>
          <button className="icon-btn">{Icon.refresh}</button>
        </div>
        <div className="scroll" style={{flex:1}}>
          <table className="data">
            <thead><tr>
              <th style={{width:32}}><input type="checkbox" className="chk"/></th>
              <th style={{width:64}}>ID</th>
              <th style={{width:50}}>Pkg</th>
              <th>Target</th>
              <th style={{width:120}}>Family</th>
              <th style={{width:60}}>Score</th>
              <th style={{width:80}}>VT</th>
              <th style={{width:60}}>Sigs</th>
              <th>MD5</th>
              <th style={{width:130}}>Machine</th>
              <th style={{width:100}}>Status</th>
              <th style={{width:90}}>Added</th>
              <th style={{width:60}}/>
            </tr></thead>
            <tbody>
              {window.CAPE_DATA.recent.map((t,i)=>(
                <tr key={t.id} className={i===0?'sel':''} onClick={()=>onOpen && onOpen(t.id)} style={{cursor:'pointer'}}>
                  <td onClick={e=>e.stopPropagation()}><input type="checkbox" className="chk"/></td>
                  <td style={{color:'var(--accent)'}}>#{t.id}</td>
                  <td><span className="tag">{t.pkg}</span></td>
                  <td style={{color:'var(--fg-0)'}}>{t.target}</td>
                  <td>{t.family!=='—'?<span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':'med')}>{t.family}</span>:<span className="dim">—</span>}</td>
                  <td>{t.status==='reported'?<span className={'tag '+(t.score>=8?'crit':t.score>=6?'high':t.score>=3?'med':t.score>=1?'low':'clean')}>{t.score.toFixed(1)}</span>:<span className="dim">—</span>}</td>
                  <td style={{color: t.vt!=='—' && parseInt(t.vt)>20?'var(--sev-crit)':'var(--fg-2)'}}>{t.vt}</td>
                  <td>{t.sigs || <span className="dim">—</span>}</td>
                  <td className="dim">{t.md5}</td>
                  <td>{t.machine}</td>
                  <td>{
                    t.status==='running'  ? <span style={{color:'var(--accent)'}}>● running</span> :
                    t.status==='pending'  ? <span style={{color:'var(--sev-med)'}}>○ pending</span> :
                                            <span style={{color:'var(--sev-clean)'}}>✓ reported</span>
                  }</td>
                  <td className="dim">{t.added}</td>
                  <td>{Icon.chevR}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* footer pager */}
        <div style={{borderTop:'1px solid var(--border)', background:'var(--bg-1)', padding:'8px 14px', display:'flex', alignItems:'center', gap:10, fontSize:11, fontFamily:'var(--mono)', color:'var(--fg-2)'}}>
          <span>1–14 of 184,729</span>
          <div style={{flex:1}}/>
          <button className="btn ghost" style={{height:22}}>‹ prev</button>
          <span style={{color:'var(--fg-0)'}}>1</span>/12,481
          <button className="btn ghost" style={{height:22}}>next ›</button>
        </div>
      </div>
    </>
  );
}
window.PageRecent = PageRecent;
