/* global React */
const { useState, useMemo } = React;

// ===================== Shared icons =====================
const Icon = {
  search: <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="7" cy="7" r="5"/><path d="m11 11 3 3"/></svg>,
  bell:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12V7a5 5 0 0 1 10 0v5l1 2H2l1-2Z"/><path d="M7 14a1.5 1.5 0 0 0 2 0"/></svg>,
  cog:    <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/></svg>,
  doc:    <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 1.5h6l4 4V14a.5.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V2a.5.5 0 0 1 .5-.5Z"/><path d="M9 1.5V5.5h4"/></svg>,
  upload: <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 11V2M5 5l3-3 3 3"/><path d="M2 11v2.5a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V11"/></svg>,
  list:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12M2 8h12M2 13h12"/></svg>,
  grid:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>,
  pulse:  <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 8h3l2-5 4 10 2-5h3"/></svg>,
  shield: <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 1.5 2.5 3.5V8c0 3.5 2.5 5.5 5.5 6.5 3-1 5.5-3 5.5-6.5V3.5L8 1.5Z"/></svg>,
  diff:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 1v10M5 11l-2-2M5 11l2-2"/><path d="M11 15V5M11 5l2 2M11 5 9 7"/></svg>,
  tag:    <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 8.5V2.5h6L14 8.5l-5.5 5.5L2 8.5Z"/><circle cx="5.5" cy="5.5" r="1"/></svg>,
  bug:    <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="6" width="6" height="7" rx="3"/><path d="M5 8H2M11 8h3M5 11H2M11 11h3M6 6V4a2 2 0 0 1 4 0v2"/></svg>,
  exit:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 1H2.5A.5.5 0 0 0 2 1.5v13a.5.5 0 0 0 .5.5H9"/><path d="M6 8h9M12 5l3 3-3 3"/></svg>,
  filter: <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12L10 9v4l-4-2V9L2 3Z"/></svg>,
  download:<svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 2v9M5 8l3 3 3-3M2 14h12"/></svg>,
  refresh:<svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 8a6 6 0 1 1-2-4.5L14 5"/><path d="M14 1v4h-4"/></svg>,
  copy:   <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/></svg>,
  ext:    <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 2h5v5M14 2 7 9M12 9v4.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5H7"/></svg>,
  play:   <svg className="i-svg" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2v12l10-6L4 2Z"/></svg>,
  chevR:  <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 3l5 5-5 5"/></svg>,
  chevD:  <svg className="i-svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 6l5 5 5-5"/></svg>,
};
window.Icon = Icon;

// ===================== Shell (sidebar + topbar) =====================
function Shell({ page, onNav, navPos = 'side', children, statusbar = true }) {
  const navItems = [
    { key:'dashboard', label:'Dashboard', ico:Icon.grid, badge:null },
    { key:'submit',    label:'Submit',    ico:Icon.upload, badge:null },
    { key:'recent',    label:'Recent',    ico:Icon.list, badge:'4' },
    { key:'pending',   label:'Pending',   ico:Icon.pulse, badge:'7' },
    { key:'search',    label:'Search',    ico:Icon.search, badge:null },
    { key:'configs',   label:'Configs',   ico:Icon.tag,    badge:null },
    { key:'compare',   label:'Compare',   ico:Icon.diff,   badge:null },
    { key:'stats',     label:'Statistics',ico:Icon.pulse,  badge:null },
  ];
  return (
    <div className="cape-frame">
      <div className="app" data-nav={navPos}>
        <div className="topbar">
          <div className="brand">
            <div className="brand-mark"></div>
            CAPE<span className="ver">v2.5</span>
          </div>
          <div className="topbar-search">
            <span className="icon">{Icon.search}</span>
            <input placeholder="Search hash, IP, family, task ID, signature…" defaultValue="" />
            <span className="hint">⌘K</span>
          </div>
          <div className="topbar-actions">
            <button className="btn ghost" style={{height:28}}>{Icon.upload}<span style={{marginLeft:6}}>Submit</span></button>
            <button className="icon-btn" title="Notifications" style={{position:'relative'}}>
              {Icon.bell}
              <span style={{position:'absolute',top:4,right:4,width:6,height:6,borderRadius:3,background:'var(--sev-crit)'}}/>
            </button>
            <button className="icon-btn" title="Settings">{Icon.cog}</button>
            <div className="user-chip">
              <span className="user-avatar">AK</span>
              <span>a.kowalski</span>
            </div>
          </div>
        </div>

        <div className="sidebar">
          {navPos === 'side' && <div className="nav-section">Workspace</div>}
          {navItems.map(n => (
            <div key={n.key} className={'nav-item'+(n.key===page?' active':'')} onClick={() => onNav && onNav(n.key)}>
              <span className="ico">{n.ico}</span>
              <span>{n.label}</span>
              {n.badge && <span className="badge">{n.badge}</span>}
            </div>
          ))}
          {navPos === 'side' && <>
            <div className="nav-section">Admin</div>
            <div className="nav-item"><span className="ico">{Icon.cog}</span>Machines<span className="badge">7</span></div>
            <div className="nav-item"><span className="ico">{Icon.doc}</span>API Docs</div>
            <div style={{flex:1}} />
            <div className="nav-item" style={{color:'var(--fg-2)'}}><span className="ico">{Icon.exit}</span>Sign out</div>
          </>}
        </div>

        <div className="main">{children}</div>

        {statusbar && (
          <div className="statusbar">
            <span className="seg"><span className="dot"/> CAPE-host-01 · online</span>
            <span className="seg">workers <span className="mono" style={{color:'var(--fg-0)'}}>4 / 7 busy</span></span>
            <span className="seg">queue <span className="mono" style={{color:'var(--fg-0)'}}>7 pending</span></span>
            <span className="seg warn"><span className="dot"/> 1 worker maintenance</span>
            <span className="right">
              <span>build 2.5.3 · py3.11</span>
              <span>uptime 14d 03:22</span>
              <span>2026-04-29 08:51:14 UTC</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
window.Shell = Shell;

// shared sub-components
function PageHead({ crumbs, actions }) {
  return (
    <div className="page-head">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">›</span>}
            <span className={i === crumbs.length-1 ? 'cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
window.PageHead = PageHead;

function ScoreBadge({ score, size }) {
  const sev = score >= 8 ? 'crit' : score >= 6 ? 'high' : score >= 3 ? 'med' : score >= 1 ? 'low' : 'clean';
  const c = `var(--sev-${sev})`;
  return (
    <div className={'score-badge'+(size==='lg'?' lg':'')} style={{ '--val': score, '--c': c }}>
      <span style={{color: c}}>{score.toFixed(1)}</span>
    </div>
  );
}
window.ScoreBadge = ScoreBadge;
