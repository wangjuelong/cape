/* global React, CAPE_DATA, Icon, PageHead */
const { useState: useState3 } = React;

// ===================== SEARCH =====================
function PageSearch() {
  return (
    <>
      <PageHead crumbs={['CAPE','Search']} actions={<button className="btn primary">{Icon.search} Run query</button>}/>
      <div className="scroll" style={{padding:14}}>
        <div className="panel" style={{marginBottom:14}}>
          <div className="panel-h">Query</div>
          <div style={{padding:14}}>
            <pre className="code" contentEditable suppressContentEditableWarning style={{minHeight:80, outline:'none'}}>
<span className="k">family</span>:<span className="s">"Qakbot"</span> <span className="k">AND</span> <span className="k">score</span>:<span className="n">{'>='}</span><span className="n">8</span> <span className="k">AND</span> <span className="k">added</span>:[<span className="s">2026-04-22</span> <span className="k">TO</span> <span className="s">now</span>]<br/>
<span className="k">AND</span> <span className="k">net.ip</span>:<span className="s">"185.234.218.0/24"</span>
            </pre>
            <div style={{marginTop:10, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap'}}>
              <span className="dim mono" style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.08em'}}>FIELDS:</span>
              {['sha256','md5','imphash','family','signature','net.ip','net.dns','net.url','mutex','file.path','reg.key','yara','mitre','machine','tag','score','added','status'].map(f=>(
                <span key={f} className="tag" style={{cursor:'pointer'}}>{f}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">Results <span className="count">· 142 matches</span>
            <div className="actions">
              <button className="btn ghost" style={{height:22}}>{Icon.download} export</button>
              <button className="btn ghost" style={{height:22}}>save query</button>
            </div>
          </div>
          <table className="data">
            <thead><tr><th style={{width:60}}>ID</th><th>Target</th><th style={{width:100}}>Family</th><th style={{width:60}}>Score</th><th>Matched IOC</th><th style={{width:90}}>Date</th></tr></thead>
            <tbody>
              {window.CAPE_DATA.recent.filter(r=>r.family==='Qakbot' || r.score>=8).slice(0,8).map((t,i)=>(
                <tr key={t.id} className={i===0?'sel':''}>
                  <td className="mono" style={{color:'var(--accent)'}}>#{t.id}</td>
                  <td style={{color:'var(--fg-0)'}}>{t.target}</td>
                  <td><span className="tag crit">{t.family}</span></td>
                  <td><span className="tag crit">{t.score.toFixed(1)}</span></td>
                  <td><span className="dim">net.ip=</span>185.234.218.41</td>
                  <td className="dim">{t.added}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel" style={{marginTop:14}}>
          <div className="panel-h">Saved searches</div>
          <div style={{padding:0}}>
            {[
              {n:'Qakbot last 7d', q:'family:"Qakbot" AND added:[now-7d TO now]', c:212},
              {n:'High-score new families', q:'score:>=8 AND family:NOT_IN(known_families)', c:31},
              {n:'C2 in NL/RU', q:'net.country:(NL OR RU) AND score:>=6', c:184},
            ].map((s,i)=>(
              <div key={i} className="list-row">
                <span className="tag accent">★</span>
                <div style={{flex:1}}>
                  <div style={{color:'var(--fg-0)'}}>{s.n}</div>
                  <div className="mono dim" style={{fontSize:10.5}}>{s.q}</div>
                </div>
                <span className="mono dim">{s.c} matches</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
window.PageSearch = PageSearch;

// ===================== CONFIGS =====================
function PageConfigs() {
  return (
    <>
      <PageHead crumbs={['CAPE','Configurations']} actions={<button className="btn">{Icon.download} export all</button>}/>
      <div className="scroll" style={{padding:14}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:14}}>
          {[
            {f:'Qakbot', c:48, sev:'crit'},
            {f:'IcedID', c:31, sev:'crit'},
            {f:'Emotet', c:24, sev:'high'},
            {f:'Cobalt Strike', c:18, sev:'crit'},
          ].map(x=>(
            <div key={x.f} className="stat">
              <div className="label">{x.f}</div>
              <div className="val" style={{color:`var(--sev-${x.sev})`}}>{x.c}</div>
              <div className="delta">configs · 7d</div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel-h">Extracted configurations <span className="count">· 312 total</span></div>
          <table className="data">
            <thead><tr><th style={{width:60}}>Task</th><th style={{width:120}}>Family</th><th style={{width:80}}>Version</th><th>Campaign</th><th>C2 servers</th><th style={{width:100}}>Mutex</th><th style={{width:90}}>Date</th></tr></thead>
            <tbody>
              {[
                {id:184729, f:'Qakbot',  v:'0x501.114', cam:'BB13', c2:'185.234.218.41 +6 more', mtx:'Glob\\{B0AFE…}', d:'08:48'},
                {id:184725, f:'IcedID',  v:'0x4D2',     cam:'forrester', c2:'104.21.81.142 +3 more', mtx:'Local\\{A2C…}', d:'08:23'},
                {id:184724, f:'Emotet',  v:'epoch5',    cam:'E5-Aug',  c2:'45.85.230.18 +12 more', mtx:'Local\\xpat',   d:'08:13'},
                {id:184722, f:'Cobalt Strike', v:'4.10.0', cam:'cs-watermark:1234567890', c2:'cdn.fakeupd[.]com', mtx:'—', d:'08:01'},
                {id:184716, f:'Remcos',  v:'4.9.3 Pro', cam:'host-x', c2:'192.119.99.42:2404',     mtx:'Rmc-X1A2B3', d:'07:21'},
                {id:184721, f:'AsyncRAT',v:'0.5.7B',    cam:'default',c2:'asyncgate[.]ddns[.]net:6606', mtx:'AsyncMutex_6SI8OkPnk', d:'07:53'},
              ].map((r,i)=>(
                <tr key={i} className={i===0?'sel':''}>
                  <td style={{color:'var(--accent)'}}>#{r.id}</td>
                  <td><span className="tag crit">{r.f}</span></td>
                  <td>{r.v}</td>
                  <td>{r.cam}</td>
                  <td>{r.c2}</td>
                  <td className="dim">{r.mtx}</td>
                  <td className="dim">{r.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
window.PageConfigs = PageConfigs;

// ===================== COMPARE =====================
function PageCompare() {
  return (
    <>
      <PageHead crumbs={['CAPE','Compare']} actions={<button className="btn primary">{Icon.diff} compare</button>}/>
      <div className="scroll" style={{padding:14}}>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14}}>
          {[
            {id:184729, target:'invoice_oct_2026.docx.exe', family:'Qakbot', score:9.2},
            {id:184719, target:'a7c2_dropper.exe',          family:'Qakbot', score:9.1},
          ].map((t,i)=>(
            <div key={i} className="panel">
              <div className="panel-h">Sample {String.fromCharCode(65+i)}</div>
              <div style={{padding:14}}>
                <div className="mono" style={{color:'var(--fg-0)', fontSize:13, marginBottom:6}}>{t.target}</div>
                <div style={{display:'flex', gap:6, marginBottom:10}}>
                  <span className="tag crit">{t.family}</span>
                  <span className="tag crit">{t.score}</span>
                  <span className="tag">#{t.id}</span>
                </div>
                <dl className="kv">
                  <dt>signatures</dt><dd>{27 - i*4}</dd>
                  <dt>imphash</dt><dd>{i===0?'4b9c1e2a8d3f7a6b5c4d2e1f8a3b9c6e':'4b9c1e2a8d3f7a6b5c4d2e1f8a3b9c6e'}</dd>
                  <dt>ssdeep sim</dt><dd style={{color:'var(--sev-clean)'}}>87%</dd>
                </dl>
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-h">Diff · signatures, IOCs, configs</div>
          <table className="data">
            <thead><tr><th style={{width:120}}>Category</th><th>Item</th><th style={{width:80}}>Sample A</th><th style={{width:80}}>Sample B</th><th style={{width:50}}>Δ</th></tr></thead>
            <tbody>
              {[
                {cat:'signature', i:'Detected Qakbot banking trojan', a:'✓', b:'✓', d:'='},
                {cat:'signature', i:'Process injection (NtMapViewOfSection)', a:'✓', b:'✓', d:'='},
                {cat:'signature', i:'Persistence via Registry Run key', a:'✓', b:'✗', d:'-'},
                {cat:'signature', i:'Modifies Windows Defender exclusions', a:'✓', b:'✗', d:'-'},
                {cat:'C2',        i:'185.234.218.41:443', a:'✓', b:'✓', d:'='},
                {cat:'C2',        i:'45.142.214.219:443', a:'✓', b:'✗', d:'-'},
                {cat:'C2',        i:'92.13.123.42:2222', a:'✗', b:'✓', d:'+'},
                {cat:'mutex',     i:'Glob\\{B0AFE91C-...}', a:'✓', b:'✓', d:'='},
                {cat:'config',    i:'campaign = BB13', a:'BB13', b:'BB12', d:'≠'},
                {cat:'config',    i:'version', a:'0x501.114', b:'0x501.108', d:'≠'},
              ].map((r,i)=>(
                <tr key={i}>
                  <td><span className="tag">{r.cat}</span></td>
                  <td style={{color:'var(--fg-0)'}}>{r.i}</td>
                  <td style={{color:r.a==='✓'?'var(--sev-clean)':'var(--fg-3)'}}>{r.a}</td>
                  <td style={{color:r.b==='✓'?'var(--sev-clean)':'var(--fg-3)'}}>{r.b}</td>
                  <td style={{color: r.d==='+'?'var(--sev-clean)':r.d==='-'?'var(--sev-crit)':r.d==='≠'?'var(--sev-med)':'var(--fg-3)', fontFamily:'var(--mono)', fontWeight:600}}>{r.d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
window.PageCompare = PageCompare;

// ===================== STATISTICS =====================
function PageStats() {
  return (
    <>
      <PageHead crumbs={['CAPE','Statistics']} actions={
        <>
          <span className="dim mono" style={{fontSize:11}}>range:</span>
          <button className="btn">last 30 days ▾</button>
        </>
      }/>
      <div className="scroll" style={{padding:14}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:10, marginBottom:14}}>
          {[
            {l:'Tasks (30d)', v:'42,184', d:'▲ 12% vs prev'},
            {l:'Avg analysis', v:'5m 34s', d:'▼ 8s'},
            {l:'Unique families', v:'87'},
            {l:'Unique C2', v:'1,247'},
            {l:'API hooks/s', v:'3.42M'},
          ].map((s,i)=>(
            <div key={i} className="stat">
              <div className="label">{s.l}</div>
              <div className="val">{s.v}</div>
              {s.d && <div className="delta up">{s.d}</div>}
            </div>
          ))}
        </div>

        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr', gap:10, marginBottom:14}}>
          <div className="panel">
            <div className="panel-h">Daily throughput · 30d</div>
            <div style={{padding:14, height:180, display:'flex', alignItems:'flex-end', gap:3}}>
              {Array.from({length:30}).map((_,i)=>{
                const h = 30 + Math.sin(i/3)*20 + Math.cos(i/2)*15 + (i>20?20:0);
                return <div key={i} style={{flex:1, height:`${h+30}%`, background: i>=27?'var(--accent)':'var(--bg-3)', borderRadius:'2px 2px 0 0'}}/>;
              })}
            </div>
            <div style={{padding:'0 14px 10px', display:'flex', justifyContent:'space-between'}} className="mono dim">
              <span>2026-03-30</span><span>2026-04-15</span><span>2026-04-29</span>
            </div>
          </div>
          <div className="panel">
            <div className="panel-h">Verdict distribution</div>
            <div style={{padding:14}}>
              {[
                {l:'Malicious', v:38.4, c:'crit'},
                {l:'Suspicious', v:12.1, c:'high'},
                {l:'Likely benign', v:18.4, c:'low'},
                {l:'Clean', v:31.1, c:'clean'},
              ].map(r=>(
                <div key={r.l} style={{display:'grid', gridTemplateColumns:'120px 1fr 50px', gap:10, alignItems:'center', padding:'5px 0'}}>
                  <span style={{color:'var(--fg-0)'}}>{r.l}</span>
                  <div className="prog" style={{height:8}}><i style={{width:`${r.v}%`, background:`var(--sev-${r.c})`}}/></div>
                  <span className="mono dim" style={{textAlign:'right'}}>{r.v}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-h">Top families · 30d</div>
          <table className="data">
            <thead><tr><th>Family</th><th style={{width:80}}>Samples</th><th style={{width:80}}>Avg score</th><th style={{width:100}}>Configs</th><th>First seen</th><th>Last seen</th></tr></thead>
            <tbody>
              {[
                {f:'Qakbot', samples:1432, score:9.0, configs:1284, first:'2024-09-12', last:'2026-04-29'},
                {f:'IcedID', samples:912, score:8.7, configs:847, first:'2024-11-04', last:'2026-04-29'},
                {f:'Emotet', samples:721, score:8.2, configs:612, first:'2024-08-14', last:'2026-04-28'},
                {f:'Cobalt Strike', samples:584, score:9.4, configs:118, first:'2024-07-02', last:'2026-04-29'},
                {f:'AsyncRAT', samples:412, score:7.8, configs:401, first:'2025-01-21', last:'2026-04-29'},
                {f:'Remcos', samples:388, score:8.4, configs:372, first:'2025-02-08', last:'2026-04-28'},
                {f:'AgentTesla', samples:271, score:7.6, configs:261, first:'2025-03-12', last:'2026-04-27'},
              ].map((r,i)=>(
                <tr key={i}>
                  <td><span className="tag crit">{r.f}</span></td>
                  <td className="mono">{r.samples.toLocaleString()}</td>
                  <td><span className="tag crit">{r.score}</span></td>
                  <td className="mono">{r.configs}</td>
                  <td className="dim">{r.first}</td>
                  <td className="dim">{r.last}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
window.PageStats = PageStats;

// ===================== PENDING =====================
function PagePending() {
  return (
    <>
      <PageHead crumbs={['CAPE','Pending queue']} actions={<button className="btn">{Icon.refresh}</button>}/>
      <div className="scroll" style={{padding:14}}>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:14}}>
          <div className="stat"><div className="label">Pending</div><div className="val" style={{color:'var(--sev-med)'}}>7</div></div>
          <div className="stat"><div className="label">Running</div><div className="val" style={{color:'var(--accent)'}}>4</div></div>
          <div className="stat"><div className="label">Avg wait</div><div className="val">4m 12s</div></div>
          <div className="stat"><div className="label">Failed (24h)</div><div className="val" style={{color:'var(--sev-crit)'}}>28</div></div>
        </div>
        <div className="panel">
          <div className="panel-h">Queue</div>
          <table className="data">
            <thead><tr><th style={{width:50}}>#</th><th style={{width:64}}>ID</th><th>Target</th><th style={{width:80}}>Pkg</th><th style={{width:90}}>Priority</th><th style={{width:140}}>Machine req.</th><th style={{width:100}}>State</th><th>Eta</th></tr></thead>
            <tbody>
              {[
                {p:1, id:184719, t:'a7c2_dropper.exe', pkg:'exe', pri:'high', m:'win10x64', s:'running', eta:'2m 40s'},
                {p:2, id:184722, t:'shellcode_loader.bin', pkg:'bin', pri:'high', m:'win10x64', s:'running', eta:'1m 12s'},
                {p:3, id:184724, t:'orders_q3.xlsm', pkg:'xls', pri:'medium', m:'win10x64', s:'running', eta:'4m 02s'},
                {p:4, id:184726, t:'https://login-microsft[.]xyz/auth', pkg:'url', pri:'medium', m:'win10x64', s:'running', eta:'0m 48s'},
                {p:5, id:184718, t:'patch_0421.exe', pkg:'exe', pri:'low', m:'win10x64', s:'pending', eta:'~5m'},
                {p:6, id:184730, t:'sample_xyz.dll', pkg:'dll', pri:'medium', m:'win10x64', s:'pending', eta:'~7m'},
                {p:7, id:184731, t:'macro_chain.docm', pkg:'doc', pri:'low', m:'win10x64', s:'pending', eta:'~10m'},
              ].map(r=>(
                <tr key={r.id}>
                  <td className="dim">{r.p}</td>
                  <td style={{color:'var(--accent)'}}>#{r.id}</td>
                  <td style={{color:'var(--fg-0)'}}>{r.t}</td>
                  <td><span className="tag">{r.pkg}</span></td>
                  <td><span className={'tag '+(r.pri==='high'?'high':r.pri==='medium'?'med':'low')}>{r.pri}</span></td>
                  <td>{r.m}</td>
                  <td>{r.s==='running'?<span style={{color:'var(--accent)'}}>● running</span>:<span style={{color:'var(--sev-med)'}}>○ pending</span>}</td>
                  <td className="dim">{r.eta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
window.PagePending = PagePending;

// ===================== LOGIN =====================
function PageLogin() {
  return (
    <div style={{width:'100%', height:'100%', background:'var(--bg-0)', display:'grid', placeItems:'center', position:'relative', overflow:'hidden', fontFamily:'var(--sans)'}}>
      <div style={{position:'absolute', inset:0, backgroundImage:'linear-gradient(var(--bg-3) 1px, transparent 1px), linear-gradient(90deg, var(--bg-3) 1px, transparent 1px)', backgroundSize:'40px 40px', opacity:0.25, maskImage:'radial-gradient(ellipse at center, black 30%, transparent 70%)'}}/>
      <div style={{position:'relative', width:380, background:'var(--bg-1)', border:'1px solid var(--border)', borderRadius:6, padding:32, boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:24}}>
          <div className="brand-mark" style={{width:32, height:32}}/>
          <div>
            <div style={{fontSize:14, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--fg-0)'}}>CAPE Sandbox</div>
            <div className="mono dim" style={{fontSize:10.5}}>v2.5.3 · build a72e1f4</div>
          </div>
        </div>
        <div style={{fontSize:18, color:'var(--fg-0)', fontWeight:600, marginBottom:4}}>Sign in</div>
        <div className="dim" style={{fontSize:12, marginBottom:20}}>Authenticate to access the malware analysis console.</div>

        <label style={{fontSize:10.5, color:'var(--fg-2)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>Username</label>
        <input className="mono" defaultValue="a.kowalski" style={{width:'100%', height:34, padding:'0 12px', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)', borderRadius:3, fontSize:12, marginTop:4, marginBottom:14}}/>

        <label style={{fontSize:10.5, color:'var(--fg-2)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>Password</label>
        <input type="password" defaultValue="••••••••••••" style={{width:'100%', height:34, padding:'0 12px', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)', borderRadius:3, fontSize:12, marginTop:4, marginBottom:14, fontFamily:'var(--mono)'}}/>

        <label style={{fontSize:10.5, color:'var(--fg-2)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600}}>Two-factor code</label>
        <div style={{display:'flex', gap:6, marginTop:4, marginBottom:18}}>
          {['4','7','2','3','9','1'].map((d,i)=>(
            <input key={i} defaultValue={d} maxLength={1} style={{width:'100%', height:38, textAlign:'center', background:'var(--bg-2)', border:'1px solid var(--border)', color:'var(--fg-0)', borderRadius:3, fontSize:18, fontFamily:'var(--mono)', fontWeight:600}}/>
          ))}
        </div>

        <button className="btn primary" style={{width:'100%', height:36, justifyContent:'center', fontSize:13}}>Sign in →</button>

        <div style={{marginTop:18, paddingTop:14, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', fontSize:11}} className="dim mono">
          <span>SSO · OIDC</span>
          <span>· LDAP</span>
          <span>capesandbox.com</span>
        </div>
      </div>
      <div style={{position:'absolute', bottom:14, left:0, right:0, textAlign:'center'}} className="mono dim">
        <span style={{fontSize:10.5}}>This system is monitored. Sample data is encrypted at rest. Unauthorized access is prohibited.</span>
      </div>
    </div>
  );
}
window.PageLogin = PageLogin;
