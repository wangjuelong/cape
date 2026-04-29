/* global React, CAPE_DATA, Icon, PageHead, ScoreBadge */
const { useState: useState2 } = React;

// ===================== ANALYSIS REPORT (centerpiece) =====================
// Reimagined: left "evidence rail" with tactic-grouped findings, center timeline scrubber,
// right contextual detail. Original CAPE tabs preserved as quick-jump pills.
function PageReport() {
  const T = window.CAPE_DATA.currentTask;
  const [tab, setTab] = useState2('summary');
  const [selSig, setSelSig] = useState2(0);
  const [scrub, setScrub] = useState2(2580);

  const tabs = [
    {k:'summary',  l:'Summary',     n: window.CAPE_DATA.signatures.length},
    {k:'static',   l:'Static',      n: 84},
    {k:'behavior', l:'Behavior',    n: '18.4k'},
    {k:'network',  l:'Network',     n: T.network_count},
    {k:'dropped',  l:'Dropped',     n: T.files_dropped},
    {k:'screens',  l:'Screenshots', n: 8},
    {k:'payloads', l:'Payloads',    n: T.payloads},
    {k:'mitre',    l:'ATT&CK',      n: 14},
    {k:'config',   l:'Config',      n: 1},
  ];

  return (
    <>
      <PageHead crumbs={['CAPE','Recent', `Task #${T.id}`]} actions={
        <>
          <button className="btn">{Icon.diff}Compare</button>
          <button className="btn">{Icon.download}Export</button>
          <button className="btn">{Icon.refresh}Re-run</button>
          <button className="btn ghost danger">Delete</button>
        </>
      }/>

      {/* Verdict banner */}
      <div style={{padding:'12px 14px', borderBottom:'1px solid var(--border)', background:'linear-gradient(180deg, rgba(255,79,107,0.06), transparent)', display:'flex', gap:14, alignItems:'center'}}>
        <ScoreBadge score={T.score} size="lg"/>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap'}}>
            <span className="tag crit" style={{height:20, fontSize:11, fontWeight:600}}>● MALICIOUS</span>
            <span className="tag crit">{T.family}</span>
            <span className="tag">campaign · BB13</span>
            <span className="tag">PE32</span>
            <span className="dim mono" style={{fontSize:11}}>· task #{T.id} · {T.machine} · {T.duration}</span>
          </div>
          <div style={{fontSize:18, color:'var(--fg-0)', fontWeight:600, marginBottom:2, fontFamily:'var(--mono)'}}>{T.target}</div>
          <div className="mono dim" style={{fontSize:11, overflow:'hidden', textOverflow:'ellipsis'}}>sha256: {T.sha256}</div>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'repeat(4, auto)', gap:24, paddingRight:8}}>
          <Metric label="Signatures" val={T.signatures_count} accent="crit"/>
          <Metric label="YARA hits" val={T.yara_matches}/>
          <Metric label="API calls" val={'18.4k'}/>
          <Metric label="Network" val={T.network_count}/>
        </div>
      </div>

      {/* Quick-tab pills */}
      <div className="tabs" style={{paddingLeft:14, height:34, overflowX:'auto'}}>
        {tabs.map(t=>(
          <div key={t.k} className={'tab'+(tab===t.k?' active':'')} onClick={()=>setTab(t.k)}>
            <span>{t.l}</span><span className="num">{t.n}</span>
          </div>
        ))}
      </div>

      {/* SUMMARY: 3-pane layout */}
      {tab==='summary' && (
        <div className="split" style={{flex:1, minHeight:0}}>
          {/* LEFT: signatures rail */}
          <div style={{width:380, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--bg-1)'}}>
            <div className="panel-h" style={{borderBottom:'1px solid var(--border)'}}>Findings <span className="count">· {T.signatures_count}</span>
              <div className="actions"><span className="dim mono" style={{fontSize:10.5}}>sort: severity</span></div>
            </div>
            <div className="lane-scroll" style={{flex:1}}>
              {window.CAPE_DATA.signatures.map((s,i)=>(
                <div key={i} className={'sig-row '+s.sev+(i===selSig?' sel':'')} onClick={()=>setSelSig(i)}
                     style={{cursor:'pointer', background: i===selSig?'var(--accent-soft)':undefined}}>
                  <div className="bar"/>
                  <div>
                    <div className="ttl">{s.name}</div>
                    <div className="desc" style={{display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden'}}>{s.desc}</div>
                    {s.mitre.length>0 && <div className="att">{s.mitre.map(m=><span key={m} className="tag" style={{height:14, fontSize:9.5}}>{m}</span>)}</div>}
                  </div>
                  <span className={'tag '+s.sev} style={{height:16, fontSize:9.5, alignSelf:'start'}}>{s.sev.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER: timeline + selected signature evidence */}
          <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column', background:'var(--bg-0)'}}>
            <div style={{padding:14, borderBottom:'1px solid var(--border)'}}>
              <div className="dim mono" style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8}}>Detonation timeline · 0–5m 45s</div>
              <Timeline scrub={scrub} setScrub={setScrub}/>
              <div style={{display:'flex', gap:14, marginTop:6, fontSize:10.5}} className="mono dim">
                <span><span style={{color:'var(--sev-crit)'}}>●</span> injection</span>
                <span><span style={{color:'var(--sev-high)'}}>●</span> persistence</span>
                <span><span style={{color:'var(--sev-high)'}}>●</span> network</span>
                <span><span style={{color:'var(--sev-med)'}}>●</span> evasion</span>
                <span><span style={{color:'var(--accent)'}}>●</span> general</span>
                <span style={{marginLeft:'auto', color:'var(--fg-0)'}}>cursor: t={Math.floor(scrub/1000)}.{(scrub%1000).toString().padStart(3,'0')}s</span>
              </div>
            </div>

            {/* Selected signature detail */}
            <div style={{padding:14, flex:1, overflow:'auto'}}>
              <SigDetail sig={window.CAPE_DATA.signatures[selSig]}/>
              <div style={{marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
                <div className="panel">
                  <div className="panel-h">Process tree</div>
                  <div style={{padding:'8px 12px'}}><ProcessTree nodes={window.CAPE_DATA.processes} indent={0}/></div>
                </div>
                <div className="panel">
                  <div className="panel-h">Top API calls near cursor</div>
                  <div style={{padding:0}}>
                    {window.CAPE_DATA.apiTimeline.filter(a=>Math.abs(a.t-scrub)<800).slice(0,8).map((a,i)=>(
                      <div key={i} style={{padding:'5px 12px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'46px 60px 1fr auto', gap:8, fontFamily:'var(--mono)', fontSize:11, alignItems:'center'}}>
                        <span className="dim">{(a.t/1000).toFixed(2)}s</span>
                        <span className={'tag '+a.sev} style={{height:14, fontSize:9.5}}>{a.cat}</span>
                        <span style={{color:'var(--fg-0)'}}>{a.api}<span className="dim" style={{marginLeft:6}}>{a.arg}</span></span>
                        <span className="dim">{Icon.chevR}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: file metadata + IOCs */}
          <div style={{width:340, borderLeft:'1px solid var(--border)', overflow:'auto', background:'var(--bg-1)'}}>
            <div className="panel-h">File</div>
            <div style={{padding:'10px 14px'}}>
              <dl className="kv">
                <dt>name</dt><dd>{T.target}</dd>
                <dt>sha256</dt><dd>{T.sha256}</dd>
                <dt>sha1</dt><dd>{T.sha1}</dd>
                <dt>md5</dt><dd>{T.md5}</dd>
                <dt>size</dt><dd>{T.size.toLocaleString()} B</dd>
                <dt>type</dt><dd style={{whiteSpace:'normal'}}>{T.type}</dd>
                <dt>signed</dt><dd style={{color:'var(--sev-crit)'}}>yes (revoked)</dd>
                <dt>VirusTotal</dt><dd style={{color:'var(--sev-crit)'}}>58 / 72</dd>
                <dt>imphash</dt><dd>4b9c1e2a8d3f7a6b5c4d2e1f8a3b9c6e</dd>
                <dt>ssdeep</dt><dd style={{whiteSpace:'normal'}}>12288:abc...xyz</dd>
                <dt>entropy</dt><dd>7.81 (packed)</dd>
              </dl>
            </div>
            <div className="panel-h">Top IOCs</div>
            <div style={{padding:'8px 14px', display:'flex', flexDirection:'column', gap:4, fontFamily:'var(--mono)', fontSize:11}}>
              <IocRow type="ip"  v="185.234.218.41"/>
              <IocRow type="ip"  v="45.142.214.219"/>
              <IocRow type="dns" v="pcunilojeb[.]com"/>
              <IocRow type="dns" v="asedhuhyvbdsa[.]xyz"/>
              <IocRow type="reg" v="HKCU\…\Run\jhgfdsa"/>
              <IocRow type="mtx" v="Glob\{B0AFE91C-…}"/>
              <IocRow type="path" v="%APPDATA%\Microsoft\Yvbnmkj\rundll32.exe"/>
            </div>
            <div className="panel-h">YARA matches <span className="count">· {T.yara_matches}</span></div>
            <div style={{padding:'8px 14px', display:'flex', flexWrap:'wrap', gap:4}}>
              {['Qakbot','Qakbot_config','PE_Packed_UPX_modified','Anti_VM_RegistryCheck','ShellcodeLoader','Suspicious_NtMapViewOfSection','Defender_Tampering','PowerShell_Encoded','RC4_KeySchedule','Process_Hollowing','Win_API_Resolver'].map(y=>(
                <span key={y} className="tag accent">{y}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==='static' && <StaticPane/>}
      {tab==='behavior' && <BehaviorPane/>}
      {tab==='network' && <NetworkPane/>}
      {tab==='dropped' && <DroppedPane/>}
      {tab==='screens' && <ScreensPane/>}
      {tab==='payloads' && <PayloadsPane/>}
      {tab==='mitre' && <MitrePane/>}
      {tab==='config' && <ConfigPane/>}
    </>
  );
}

function Metric({ label, val, accent }) {
  return (
    <div>
      <div className="mono" style={{fontSize:10, color:'var(--fg-3)', textTransform:'uppercase', letterSpacing:'0.08em'}}>{label}</div>
      <div className="mono" style={{fontSize:18, fontWeight:600, color: accent==='crit'?'var(--sev-crit)':'var(--fg-0)', lineHeight:1.1}}>{val}</div>
    </div>
  );
}

function Timeline({ scrub, setScrub }) {
  const total = 5745;
  const evs = window.CAPE_DATA.apiTimeline;
  return (
    <div className="timeline" onClick={e=>{
      const r = e.currentTarget.getBoundingClientRect();
      setScrub(Math.round((e.clientX - r.left) / r.width * total));
    }}>
      <div className="tl-bar">
        {evs.map((ev,i)=>(
          <div key={i} className={'tl-event '+ev.sev} style={{left:`${(ev.t/total)*100}%`}} title={ev.api}/>
        ))}
        <div className="tl-cursor" style={{left:`${(scrub/total)*100}%`}}/>
      </div>
    </div>
  );
}

function SigDetail({ sig }) {
  return (
    <div className="panel">
      <div className="panel-h">{sig.name}<span className={'tag '+sig.sev} style={{marginLeft:8, height:16}}>{sig.sev.toUpperCase()}</span>
        <div className="actions">{sig.mitre.map(m=><span key={m} className="tag accent">{m}</span>)}</div>
      </div>
      <div style={{padding:14}}>
        <div style={{fontSize:12.5, color:'var(--fg-1)', marginBottom:12, lineHeight:1.6}}>{sig.desc}</div>
        <div className="dim mono" style={{fontSize:10.5, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6}}>Evidence</div>
        <pre className="code"><span className="c">// API call sequence triggering this signature</span>{`\n`}
[<span className="n">  1042</span> ms]  <span className="f">NtUnmapViewOfSection</span>(target=<span className="s">"svchost.exe"</span>, pid=<span className="n">3120</span>){`\n`}
[<span className="n">  1060</span> ms]  <span className="f">NtMapViewOfSection</span>(section=<span className="n">0x180</span>, target=<span className="s">"explorer.exe"</span>){'\n'}
[<span className="n">  1180</span> ms]  <span className="f">SetThreadContext</span>(thread=<span className="n">0xa4</span>, eip=<span className="n">0x10001a40</span>){'\n'}
[<span className="n">  1184</span> ms]  <span className="f">NtResumeThread</span>(thread=<span className="n">0xa4</span>) <span className="c">// → execution transferred</span>
        </pre>
      </div>
    </div>
  );
}

function ProcessTree({ nodes, indent }) {
  return (
    <div className="tree">
      {nodes.map((n,i)=>(
        <div key={n.pid}>
          <div className={'node '+(n.cls||'')}>
            <span style={{width:indent*16}}/>
            <span className="dim">{Icon.chevD}</span>
            <span className="pid">[{n.pid}]</span>
            <span className="name">{n.name}</span>
            {n.cls==='malicious' && <span className="tag crit" style={{height:14,fontSize:9.5,marginLeft:'auto'}}>MAL</span>}
            {n.cls==='suspicious' && <span className="tag high" style={{height:14,fontSize:9.5,marginLeft:'auto'}}>SUS</span>}
          </div>
          {n.children && <ProcessTree nodes={n.children} indent={indent+1}/>}
        </div>
      ))}
    </div>
  );
}

function IocRow({ type, v }) {
  const colors = { ip:'high', dns:'high', reg:'med', mtx:'med', path:'low' };
  return (
    <div style={{display:'flex', alignItems:'center', gap:6, padding:'3px 0'}}>
      <span className={'tag '+(colors[type]||'')} style={{height:14, fontSize:9.5, minWidth:32, justifyContent:'center'}}>{type}</span>
      <span style={{color:'var(--fg-0)', flex:1, overflow:'hidden', textOverflow:'ellipsis'}}>{v}</span>
      <span className="dim" style={{cursor:'pointer'}}>{Icon.copy}</span>
    </div>
  );
}

// ============== STATIC pane ==============
function StaticPane() {
  return (
    <div className="scroll" style={{padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
      <div className="panel">
        <div className="panel-h">PE header</div>
        <div style={{padding:14}}><dl className="kv">
          <dt>magic</dt><dd>PE\\0\\0</dd>
          <dt>machine</dt><dd>0x014c (i386)</dd>
          <dt>timestamp</dt><dd>2026-04-21 14:08:11 UTC <span className="dim">(8 days ago)</span></dd>
          <dt>subsystem</dt><dd>GUI</dd>
          <dt>entry point</dt><dd>0x00401a40</dd>
          <dt>image base</dt><dd>0x00400000</dd>
          <dt>checksum</dt><dd>0x00000000 <span className="muted">(invalid)</span></dd>
          <dt>sections</dt><dd>5 (.text .rdata .data .rsrc .reloc)</dd>
        </dl></div>
      </div>
      <div className="panel">
        <div className="panel-h">Sections</div>
        <table className="data">
          <thead><tr><th>Name</th><th>VA</th><th>Size</th><th>Entropy</th><th>Flags</th></tr></thead>
          <tbody>
            <tr><td>.text</td><td>0x1000</td><td>0x6c000</td><td style={{color:'var(--sev-high)'}}>7.91</td><td>RX</td></tr>
            <tr><td>.rdata</td><td>0x6d000</td><td>0x12000</td><td>5.42</td><td>R</td></tr>
            <tr><td>.data</td><td>0x7f000</td><td>0x4000</td><td>4.81</td><td>RW</td></tr>
            <tr><td>.rsrc</td><td>0x83000</td><td>0x1000</td><td>3.21</td><td>R</td></tr>
            <tr><td>.reloc</td><td>0x84000</td><td>0x2000</td><td>2.19</td><td>R</td></tr>
          </tbody>
        </table>
      </div>
      <div className="panel">
        <div className="panel-h">Imports <span className="count">· 142 functions / 8 dlls</span></div>
        <div style={{padding:'8px 14px', maxHeight:240, overflow:'auto'}}>
          <pre className="code" style={{border:'none', background:'transparent', padding:0}}>{`KERNEL32.dll  →  CreateFileW, VirtualAlloc, VirtualProtect,
                 WriteProcessMemory, CreateProcessW, GetProcAddress,
                 LoadLibraryA, IsDebuggerPresent ...`}{`\n`}{`USER32.dll    →  GetWindowTextW, FindWindowW, GetCursorPos`}{'\n'}
{`ADVAPI32.dll  →  RegSetValueExW, RegOpenKeyExW, OpenProcessToken`}{'\n'}
{`WININET.dll   →  InternetOpenW, HttpSendRequestW, InternetReadFile`}{'\n'}
{`NTDLL.dll     →  NtMapViewOfSection, NtUnmapViewOfSection,`}{'\n'}
{`                 NtCreateThreadEx, NtQuerySystemInformation`}</pre>
        </div>
      </div>
      <div className="panel">
        <div className="panel-h">Strings <span className="count">· 1,847 / showing flagged 24</span></div>
        <div style={{padding:'4px 0', maxHeight:240, overflow:'auto', fontFamily:'var(--mono)', fontSize:11}}>
          {[
            'pcunilojeb.com',
            'asedhuhyvbdsa.xyz',
            'powershell -nop -w hidden -enc',
            'Add-MpPreference -ExclusionPath',
            'rundll32.exe',
            'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
            'Glob\\{B0AFE91C-2A4F-4F8E-9D1B-4E2D6A8F3C1E}',
            'SeDebugPrivilege',
            '%APPDATA%\\Microsoft\\Yvbnmkj\\',
            'NtUnmapViewOfSection',
          ].map((s,i)=>(
            <div key={i} style={{padding:'3px 12px', display:'flex', gap:10, color:'var(--fg-1)'}}>
              <span className="dim" style={{width:60}}>0x{(0x401000+i*32).toString(16)}</span>
              <span style={{color:'var(--fg-0)'}}>{s}</span>
              {i<5 && <span className="tag crit" style={{height:14,fontSize:9.5, marginLeft:'auto'}}>flagged</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== BEHAVIOR pane ==============
function BehaviorPane() {
  return (
    <div className="split" style={{flex:1, minHeight:0}}>
      <div style={{width:300, borderRight:'1px solid var(--border)', background:'var(--bg-1)', overflow:'auto'}}>
        <div className="panel-h">Process tree</div>
        <div style={{padding:'8px 12px'}}><ProcessTree nodes={window.CAPE_DATA.processes} indent={0}/></div>
      </div>
      <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
        <div className="panel-h" style={{borderBottom:'1px solid var(--border)'}}>API calls · pid 1284 → invoice_oct_2026.docx.exe <span className="count">· 18,472</span>
          <div className="actions"><button className="btn ghost" style={{height:22}}>{Icon.filter} category</button></div>
        </div>
        <div className="scroll" style={{flex:1}}>
          <table className="data">
            <thead><tr>
              <th style={{width:64}}>t</th>
              <th style={{width:80}}>cat</th>
              <th style={{width:60}}>tid</th>
              <th>API</th>
              <th>Arguments</th>
              <th style={{width:80}}>Return</th>
            </tr></thead>
            <tbody>
              {window.CAPE_DATA.apiTimeline.map((a,i)=>(
                <tr key={i} className={a.sev==='crit'?'sel':''}>
                  <td className="dim">{(a.t/1000).toFixed(3)}s</td>
                  <td><span className={'tag '+a.sev} style={{height:14, fontSize:9.5}}>{a.cat}</span></td>
                  <td className="dim">0x4{(0xc4+i).toString(16)}</td>
                  <td style={{color:'var(--fg-0)'}}>{a.api}</td>
                  <td>{a.arg}</td>
                  <td style={{color:'var(--sev-clean)'}}>STATUS_SUCCESS</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============== NETWORK pane ==============
function NetworkPane() {
  const N = window.CAPE_DATA.network;
  return (
    <div className="scroll" style={{padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, gridAutoRows:'min-content'}}>
      <div className="panel" style={{gridColumn:'1 / -1'}}>
        <div className="panel-h">Network map · 4 hosts contacted</div>
        <div style={{padding:14, display:'grid', gridTemplateColumns:'auto 1fr', gap:24, alignItems:'center'}}>
          <div style={{textAlign:'center'}}>
            <div style={{width:60, height:60, border:'2px solid var(--accent)', borderRadius:30, display:'grid', placeItems:'center', margin:'0 auto', fontFamily:'var(--mono)', fontSize:10, color:'var(--accent)'}}>VICTIM</div>
            <div className="mono dim" style={{fontSize:10.5, marginTop:4}}>192.168.122.240</div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6}}>
            {N.hosts.map(h=>(
              <div key={h.ip} style={{display:'grid', gridTemplateColumns:'auto 1fr auto auto auto', gap:10, alignItems:'center', padding:'6px 10px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:3}}>
                <span className={'tag '+(h.flag?'crit':'low')} style={{height:18, fontSize:10}}>{h.country}</span>
                <span className="mono" style={{color:'var(--fg-0)'}}>{h.ip}<span className="dim">:{h.port}</span> · {h.proto}</span>
                <span className="mono dim">{h.pkts} pkts</span>
                <span className="mono dim">{h.bytes}</span>
                {h.flag && <span className="tag crit" style={{height:14, fontSize:9.5}}>C2</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">DNS queries <span className="count">· 31</span></div>
        <table className="data">
          <thead><tr><th>Query</th><th style={{width:50}}>Type</th><th>Answer</th><th style={{width:40}}>#</th></tr></thead>
          <tbody>{N.dns.map((d,i)=>(
            <tr key={i} className={d.sus?'':''}>
              <td style={{color: d.sus?'var(--sev-crit)':'var(--fg-0)'}}>{d.q}</td>
              <td>{d.t}</td>
              <td>{d.a}</td>
              <td>{d.cnt}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="panel">
        <div className="panel-h">HTTP / HTTPS</div>
        <table className="data">
          <thead><tr><th style={{width:60}}>Method</th><th>Host</th><th>Path</th><th style={{width:60}}>Status</th><th style={{width:60}}>Size</th></tr></thead>
          <tbody>{N.http.map((h,i)=>(
            <tr key={i}>
              <td><span className={'tag '+(h.method==='POST'?'high':'')} style={{height:14, fontSize:9.5}}>{h.method}</span></td>
              <td style={{color: h.sus?'var(--sev-crit)':'var(--fg-0)'}}>{h.host}</td>
              <td>{h.path}</td>
              <td style={{color:'var(--sev-clean)'}}>{h.status}</td>
              <td>{h.len}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="panel" style={{gridColumn:'1 / -1'}}>
        <div className="panel-h">Suricata alerts <span className="count">· 6</span></div>
        <div style={{padding:0}}>
          {[
            {sid:'2032417', sev:'crit', msg:'ET MALWARE Qakbot CnC Activity', src:'192.168.122.240:49812', dst:'185.234.218.41:443'},
            {sid:'2031211', sev:'high', msg:'ET MALWARE Suspicious User-Agent (Mozilla/4.0)', src:'192.168.122.240:49813', dst:'45.142.214.219:443'},
            {sid:'2024792', sev:'high', msg:'ET POLICY HTTP POST to dynamic DNS', src:'192.168.122.240:49814', dst:'pcunilojeb[.]com'},
          ].map((a,i)=>(
            <div key={i} className={'sig-row '+a.sev}>
              <div className="bar"/>
              <div>
                <div className="ttl">{a.msg}</div>
                <div className="desc mono">sid:<span style={{color:'var(--accent)'}}>{a.sid}</span> · {a.src} → {a.dst}</div>
              </div>
              <span className={'tag '+a.sev} style={{height:16, fontSize:9.5}}>{a.sev.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============== DROPPED files pane ==============
function DroppedPane() {
  return (
    <div className="scroll">
      <table className="data">
        <thead><tr><th style={{width:32}}><input type="checkbox" className="chk"/></th><th>Name</th><th>Path</th><th style={{width:90}}>Size</th><th>Type</th><th style={{width:120}}>YARA</th><th style={{width:32}}/></tr></thead>
        <tbody>
          {window.CAPE_DATA.files.map((f,i)=>(
            <tr key={i} className={f.sus?'sel':''}>
              <td><input type="checkbox" className="chk"/></td>
              <td style={{color: f.sus?'var(--sev-crit)':'var(--fg-0)'}}>{f.name}</td>
              <td>{f.path}</td>
              <td>{f.size}</td>
              <td>{f.type}</td>
              <td>{f.yara!=='—'?<span className="tag crit">{f.yara}</span>:<span className="dim">—</span>}</td>
              <td>{Icon.download}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============== SCREENSHOTS ==============
function ScreensPane() {
  return (
    <div className="scroll" style={{padding:14}}>
      <div className="dim mono" style={{fontSize:10.5, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em'}}>Screenshot timeline · 8 captures over 5m 45s</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10}}>
        {[8,52,98,140,182,226,280,338].map((t,i)=>(
          <div key={i} className="panel" style={{padding:0, overflow:'hidden'}}>
            <div className="thumb-ph" style={{aspectRatio:'16/10', display:'grid', placeItems:'center'}}>
              <span>screenshot_{String(i+1).padStart(2,'0')}.png</span>
            </div>
            <div style={{padding:'6px 10px', display:'flex', justifyContent:'space-between', fontFamily:'var(--mono)', fontSize:10.5}}>
              <span className="dim">t = {Math.floor(t/60)}:{(t%60).toString().padStart(2,'0')}</span>
              {i===3 && <span className="tag crit" style={{height:14, fontSize:9.5}}>injection</span>}
              {i===5 && <span className="tag high" style={{height:14, fontSize:9.5}}>banking ui</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== PAYLOADS ==============
function PayloadsPane() {
  return (
    <div className="scroll" style={{padding:14, display:'flex', flexDirection:'column', gap:10}}>
      {window.CAPE_DATA.payloads.map((p,i)=>(
        <div key={i} className="panel">
          <div className="panel-h">{p.name}
            <div className="actions">
              <button className="btn ghost" style={{height:22}}>{Icon.download} download</button>
              <button className="btn ghost" style={{height:22}}>{Icon.diff} pivot</button>
            </div>
          </div>
          <div style={{padding:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
            <dl className="kv">
              <dt>sha256</dt><dd>{p.sha256}</dd>
              <dt>size</dt><dd>{p.size}</dd>
              <dt>type</dt><dd>{p.type}</dd>
              <dt>extracted</dt><dd>{p.ts}</dd>
              <dt>origin</dt><dd>{p.origin}</dd>
            </dl>
            <div>
              <div className="dim mono" style={{fontSize:10.5, marginBottom:6, textTransform:'uppercase'}}>YARA</div>
              <div style={{display:'flex', gap:4, flexWrap:'wrap', marginBottom:10}}>
                {p.yara.map(y=><span key={y} className="tag accent">{y}</span>)}
              </div>
              <div className="dim mono" style={{fontSize:10.5, marginBottom:6, textTransform:'uppercase'}}>Hex preview</div>
              <pre className="code" style={{maxHeight:90}}>{`00000000  4d 5a 90 00 03 00 00 00  04 00 00 00 ff ff 00 00  MZ..............`}{'\n'}
{`00000010  b8 00 00 00 00 00 00 00  40 00 00 00 00 00 00 00  ........@.......`}{'\n'}
{`00000020  00 00 00 00 00 00 00 00  00 00 00 00 00 00 00 00  ................`}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============== MITRE ATT&CK ==============
function MitrePane() {
  return (
    <div className="scroll" style={{padding:14}}>
      <div className="dim mono" style={{fontSize:10.5, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.08em'}}>ATT&amp;CK matrix · 14 techniques across 7 tactics</div>
      <div style={{display:'grid', gridTemplateColumns:`repeat(${window.CAPE_DATA.mitre.length}, 1fr)`, gap:8}}>
        {window.CAPE_DATA.mitre.map((tac,i)=>(
          <div key={i} className="panel">
            <div className="panel-h" style={{padding:'0 10px', height:28}}>{tac.tactic}</div>
            <div style={{padding:6, display:'flex', flexDirection:'column', gap:4}}>
              {tac.techniques.map(t=>(
                <div key={t.id} style={{padding:'6px 8px', background:'var(--accent-soft)', border:'1px solid rgba(77,212,255,0.25)', borderRadius:3}}>
                  <div className="mono" style={{fontSize:10.5, color:'var(--accent)'}}>{t.id}</div>
                  <div style={{fontSize:11.5, color:'var(--fg-0)', marginTop:2, lineHeight:1.3}}>{t.name}</div>
                  <div className="mono dim" style={{fontSize:10}}>{t.count} obs.</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== CONFIG (extracted) ==============
function ConfigPane() {
  const C = window.CAPE_DATA.config;
  return (
    <div className="scroll" style={{padding:14}}>
      <div className="panel">
        <div className="panel-h">Extracted config · {C.family} <span className="count">· {C.version}</span>
          <div className="actions">
            <button className="btn ghost" style={{height:22}}>{Icon.download} JSON</button>
            <button className="btn ghost" style={{height:22}}>{Icon.copy} copy IOCs</button>
          </div>
        </div>
        <div style={{padding:14, display:'grid', gridTemplateColumns:'320px 1fr', gap:14}}>
          <dl className="kv">
            <dt>family</dt><dd style={{color:'var(--sev-crit)'}}>{C.family}</dd>
            <dt>version</dt><dd>{C.version}</dd>
            <dt>campaign</dt><dd>{C.campaign}</dd>
            <dt>install_path</dt><dd>{C.install_path}</dd>
            <dt>install_name</dt><dd>{C.install_name}</dd>
            <dt>mutex</dt><dd style={{whiteSpace:'normal'}}>{C.mutex}</dd>
          </dl>
          <div>
            <div className="dim mono" style={{fontSize:10.5, marginBottom:6, textTransform:'uppercase'}}>C2 servers · {C.c2.length}</div>
            <div style={{display:'flex', flexDirection:'column', gap:4, fontFamily:'var(--mono)', fontSize:11.5}}>
              {C.c2.map(c=>(
                <div key={c} style={{padding:'5px 10px', background:'var(--bg-2)', border:'1px solid var(--border)', borderRadius:3, display:'flex', alignItems:'center', gap:8}}>
                  <span className="tag crit" style={{height:14, fontSize:9.5}}>C2</span>
                  <span style={{color:'var(--fg-0)'}}>{c}</span>
                  <span className="dim" style={{marginLeft:'auto', cursor:'pointer'}}>{Icon.copy}</span>
                </div>
              ))}
            </div>
            <div className="dim mono" style={{fontSize:10.5, margin:'14px 0 6px', textTransform:'uppercase'}}>RSA public key</div>
            <pre className="code" style={{whiteSpace:'pre-wrap'}}>{C.rsa_pub_key}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

window.PageReport = PageReport;
