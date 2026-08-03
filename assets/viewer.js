let DATA=[];
let CFG={};          // topic config (the JSON "meta" block), set in loadData
let FILTERS=[];      // CFG.filters
const state={q:"",filters:{},sort:"az",showFavs:false,view:"list",entryId:null,yMin:null,yMax:null,crossTopic:false,
  mode:null,lineageFrom:null,lineageTo:null,lineageUndirected:false,
  infRoot:null,infDir:null,infDepth:null};
const formatViews=n=>Number(n||0).toLocaleString(undefined,{maximumFractionDigits:0});

// Available topics, loaded from data/topics.json in initApp(). The ?d= param selects
// one; anything unknown falls back to phil.
let TOPICS=[];
const FALLBACK_TOPICS=[{id:"phil"},{id:"hist-events"},{id:"hist-chars"}];
async function loadTopics(){
  try{
    const manifest=await fetch("data/topics.json").then(r=>r.json());
    if(!Array.isArray(manifest.topics)||!manifest.topics.length)throw new Error("empty manifest");
    TOPICS=manifest.topics;
  }catch(err){
    console.warn("Could not load data/topics.json, falling back to built-in topic list.",err);
    TOPICS=FALLBACK_TOPICS;
  }
}
function currentDataset(){
  const d=new URLSearchParams(location.search).get("d");
  return TOPICS.some(t=>t.id===d)?d:"phil";
}
const filterById=id=>FILTERS.find(f=>f.id===id);
const groupFilter=()=>FILTERS.find(f=>f.grouping);

async function loadData(){
  const topic=await fetch(`data/${currentDataset()}.json`).then(r=>r.json());
  CFG=topic.meta||{};
  FILTERS=CFG.filters||[];
  state.sort=CFG.defaultSort||"az";
  state.filters={};
  FILTERS.forEach(f=>{ state.filters[f.id]=new Set(); });
  let popularity={};
  if(CFG.popularity){
    popularity=await fetch("data/popularity.json").then(r=>r.json()).catch(()=>({}));
  }
  const yk=CFG.yearKey||"y";
  DATA=(topic.entries||[]).map(r=>{
    const p=popularity[r.name]||{};
    return {
      ...r,
      y:r[yk] ?? r.y,
      popularity:p.score ?? r.popularity ?? null,
      avg_views_per_day:p.avg_views_per_day ?? r.avg_views_per_day ?? 0
    };
  });
}

// ---- corpus ----
// Cross-topic corpus: every entry from every topic other than the one loadData() already
// loaded, flattened to {topic, meta, entry} so a caller always knows which topic (and its
// meta config) an entry came from. Lazy — never fetched during initial page load, only by
// features that need cross-topic context (E2-02/03/04 consume this).
let _corpus=null;
let _corpusPromise=null;
async function loadCorpus(){
  if(_corpus)return _corpus;
  if(_corpusPromise)return _corpusPromise;
  const skip=currentDataset();
  _corpusPromise=Promise.all(
    TOPICS.filter(t=>t.id!==skip).map(t=>
      fetch(`data/${t.id}.json`).then(r=>r.json())
        .then(topic=>({id:t.id,meta:topic.meta||{},entries:topic.entries||[]}))
        .catch(err=>{
          console.warn(`loadCorpus: could not load topic "${t.id}".`,err);
          return null;
        })
    )
  ).then(loaded=>{
    const flat=[];
    loaded.filter(Boolean).forEach(({id,meta,entries})=>{
      entries.forEach(entry=>flat.push({topic:id,meta,entry}));
    });
    _corpus=flat;
    return _corpus;
  });
  return _corpusPromise;
}

function corpusByYear(minY,maxY,opts){
  const {excludeTopic,excludeId}=opts||{};
  return (_corpus||[])
    .filter(c=>c.entry.y>=minY&&c.entry.y<=maxY)
    .filter(c=>!excludeTopic||c.topic!==excludeTopic)
    .filter(c=>!excludeId||c.entry.id!==excludeId)
    .sort((a,b)=>a.entry.y-b.entry.y||(a.entry.name<b.entry.name?-1:1));
}

// Normalises a Wikipedia url for cross-topic matching: lowercased, http/https treated the
// same, no trailing slash, no query string or fragment. Names differ in format across topics
// ("Abelard, Peter" vs "Peter Abelard") so the url is the only reliable join key.
function normalizeUrl(u){
  if(!u)return "";
  let s=String(u).trim().toLowerCase().replace(/^http:\/\//,"https://").split(/[?#]/)[0];
  if(s.endsWith("/"))s=s.slice(0,-1);
  return s;
}

function corpusFindByUrl(url){
  const target=normalizeUrl(url);
  if(!target)return [];
  return (_corpus||[]).filter(c=>normalizeUrl(c.entry.url)===target);
}
// ---- end corpus ----

const $=s=>document.querySelector(s);
const esc=s=>s.replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function buildPanel(id,items,setRef,multi){
  const dd=$(id), panel=dd.querySelector(".panel");
  let h="";
  if(multi) h+=`<div class="panel-head" style="display:flex;justify-content:space-between;align-items:center">
    <span>Select any</span><button class="clear-btn" data-clear>Clear</button></div>`;
  items.forEach(it=>{
    if(multi){
      h+=`<label class="opt"><input type="checkbox" value="${esc(it)}"><span>${esc(it)}</span></label>`;
    }else{
      h+=`<button type="button" class="opt radio" data-val="${esc(it[0]||it)}">
        <span>${esc(it[1]||it)}</span>
        <svg class="tick" viewBox="0 0 24 24"><polyline points="5 12 10 17 19 7"/></svg></button>`;
    }
  });
  panel.innerHTML=h;
}

// ---- config-driven UI construction (all called once from buildUI, after loadData) ----
function buildFilterDropdowns(){
  $("#filterBar").innerHTML=FILTERS.map(f=>`
    <div class="dd" id="dd-${esc(f.id)}">
      <button class="dd-btn" aria-haspopup="true"><span>${esc(f.label)}</span><span class="badge" hidden>0</span>
        <svg class="chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button>
      <div class="panel" role="group"></div>
    </div>`).join("");
}

function buildGlossBars(){
  const bars=FILTERS.filter(f=>f.glossary);
  $("#glossBars").innerHTML=bars.map((f,i)=>`
    <div class="gloss-bar"${i===bars.length-1?' style="border-bottom:none"':''}>
      <button class="gloss-toggle" aria-expanded="false" aria-controls="gb-${esc(f.id)}">
        <span>${esc(f.glossary.heading||f.label)}</span>
        <svg class="gt-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="gloss-body" id="gb-${esc(f.id)}">
        <select class="gloss-select" id="gs-${esc(f.id)}"><option value="">${esc(f.glossary.placeholder||"Choose…")}</option></select>
        <p class="gloss-desc" id="gd-${esc(f.id)}"></p>
      </div>
    </div>`).join("");
  document.querySelectorAll(".gloss-toggle").forEach(btn=>{
    btn.addEventListener("click",()=>{
      btn.setAttribute("aria-expanded",String(btn.getAttribute("aria-expanded")!=="true"));
    });
  });
}

function wireDropdowns(){
  document.querySelectorAll(".dd-btn").forEach(btn=>{
    btn.setAttribute("aria-expanded","false");
    btn.addEventListener("click",e=>{
      const dd=btn.parentElement;
      document.querySelectorAll(".dd").forEach(d=>{if(d!==dd){d.classList.remove("open");const ob=d.querySelector(".dd-btn");if(ob)ob.setAttribute("aria-expanded","false");}});
      dd.classList.toggle("open");
      btn.setAttribute("aria-expanded",String(dd.classList.contains("open")));
      if(dd.classList.contains("open")){
        const panel=dd.querySelector(".panel");
        panel.classList.remove("align-right");
        if(panel.getBoundingClientRect().right>window.innerWidth-8)panel.classList.add("align-right");
      }
    });
  });
}
document.addEventListener("click",e=>{
  if(!e.target.closest(".dd"))document.querySelectorAll(".dd").forEach(d=>{d.classList.remove("open");const ob=d.querySelector(".dd-btn");if(ob)ob.setAttribute("aria-expanded","false");});
});

function wireMulti(id,setRef){
  const dd=$(id);
  dd.querySelectorAll('input[type=checkbox]').forEach(cb=>{
    cb.addEventListener("change",()=>{
      cb.checked?setRef.add(cb.value):setRef.delete(cb.value);
      updBadge(dd,setRef.size);render();
    });
  });
  const clr=dd.querySelector("[data-clear]");
  if(clr)clr.addEventListener("click",()=>{
    setRef.clear();
    dd.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=false);
    updBadge(dd,0);render();
  });
}

function wireSort(){
  buildPanel("#ddSort",CFG.sorts||[],null,false);
  $("#ddSort").querySelectorAll(".opt").forEach(o=>{
    o.addEventListener("click",()=>{
      state.sort=o.dataset.val;
      $("#ddSort").querySelectorAll(".opt").forEach(x=>x.classList.toggle("sel",x===o));
      $("#sortLabel").textContent=o.querySelector("span").textContent;
      $("#ddSort").classList.remove("open");render();
    });
  });
  const def=$("#ddSort").querySelector(`.opt[data-val="${state.sort}"]`);
  if(def){def.classList.add("sel");$("#sortLabel").textContent=def.querySelector("span").textContent;}
}

// Build everything that depends on the loaded topic config. Runs once after loadData.
function buildUI(){
  document.title=CFG.title||"Index";
  $(".title-block h1").textContent=CFG.title||"";
  $(".title-block .sub").textContent=CFG.subtitle||"";
  $("#itemNoun").textContent=CFG.itemNoun||"";
  $("#randNoun").textContent=CFG.itemNounSingular||"";
  $("#randExhaustedNoun").textContent=CFG.itemNoun||"";
  if(CFG.footer)$("#footerNote").innerHTML=CFG.footer;
  buildFilterDropdowns();
  buildGlossBars();
  FILTERS.forEach(f=>{
    buildPanel(`#dd-${f.id}`,f.options||[],state.filters[f.id],true);
    wireMulti(`#dd-${f.id}`,state.filters[f.id]);
    if(f.glossary){
      buildGlossSelect(`gs-${f.id}`,f.glossary.terms||{});
      wireGloss(`gs-${f.id}`,`gd-${f.id}`,f.glossary.terms||{});
    }
  });
  wireDropdowns();
  wireSort();
  if(!CFG.timeline){const vt=$(".view-toggle");if(vt)vt.style.display="none";}
}

function updBadge(dd,n){
  const b=dd.querySelector(".badge");
  if(!b)return;
  if(n>0){b.hidden=false;b.textContent=n}else{b.hidden=true}
}

$("#q").addEventListener("input",e=>{state.q=e.target.value.trim().toLowerCase();render();});
$("#allTopicsToggle").addEventListener("change",e=>{state.crossTopic=e.target.checked;render();});

const themeBtn=$("#themeBtn");
themeBtn.textContent=document.documentElement.getAttribute("data-theme")==="dark"?"Light mode":"Dark mode";
themeBtn.addEventListener("click",()=>{
  const dark=document.documentElement.getAttribute("data-theme")==="dark";
  const next=dark?"light":"dark";
  document.documentElement.setAttribute("data-theme",next);
  themeBtn.textContent=dark?"Dark mode":"Light mode";
  localStorage.setItem("phil_theme",next);
});

function highlight(text,q){
  if(!q)return esc(text);
  const i=text.toLowerCase().indexOf(q);
  if(i<0)return esc(text);
  return esc(text.slice(0,i))+"<mark>"+esc(text.slice(i,i+q.length))+"</mark>"+esc(text.slice(i+q.length));
}

function searchTextWithKeys(r,keys){
  return keys.map(k=>{const v=r[k];return Array.isArray(v)?v.join(" "):(v==null?"":String(v));}).join(" ").toLowerCase();
}
function searchKeysFor(meta){
  return meta.searchKeys||["name","desc",...(meta.filters||[]).map(f=>f.key)];
}
function searchText(r){
  return searchTextWithKeys(r,searchKeysFor(CFG));
}

function match(r){
  if(state.showFavs && !FAVS.has(r.name))return false;
  if(state.yMin!=null && !(r.y>=state.yMin && r.y<=state.yMax))return false;
  if(infReachableSet && !infReachableSet.has(r.id))return false;
  for(const f of FILTERS){
    const sel=state.filters[f.id];
    if(!sel||!sel.size)continue;
    if(f.multiValue){
      const vals=r[f.key]||[];
      if(![...sel].some(v=>vals.includes(v)))return false;
    }else if(!sel.has(r[f.key]))return false;
  }
  if(state.q && !searchText(r).includes(state.q))return false;
  return true;
}

function sortRecs(a){
  const s=state.sort;
  const c=[...a];
  if(s==="az")c.sort((x,y)=>x.name.toLowerCase()<y.name.toLowerCase()?-1:1);
  if(s==="old")c.sort((x,y)=>x.y-y.y||(x.name<y.name?-1:1));
  if(s==="new")c.sort((x,y)=>y.y-x.y||(x.name<y.name?-1:1));
  if(s==="popularity")c.sort((x,y)=>(y.avg_views_per_day||0)-(x.avg_views_per_day||0)||(x.name<y.name?-1:1));
  if(s==="random")c.sort(()=>Math.random()-.5);
  return c;
}

function renderActiveTags(){
  const box=$("#activeTags");let h="";
  const mk=(label,grp,val)=>`<button class="chip" data-grp="${grp}" data-val="${esc(val)}">${esc(label)} <span>&times;</span></button>`;
  FILTERS.forEach(f=>{ state.filters[f.id].forEach(v=>h+=mk(v,f.id,v)); });
  if(state.yMin!=null){
    h+=`<button class="chip" data-period-clear>${esc(yearLabel(state.yMin))}&ndash;${esc(yearLabel(state.yMax))} <span>&times;</span></button>`;
  }
  if(state.infRoot){
    const rootEntry=DATA.find(e=>e.id===state.infRoot);
    const rootName=rootEntry?rootEntry.name:state.infRoot;
    const dirLabel=state.infDir==="downstream"?"Influenced by":state.infDir==="upstream"?"Influenced":"Connected to";
    const hopLabel=`${state.infDepth} hop${state.infDepth===1?"":"s"}`;
    h+=`<button class="chip chip-inf" data-inf-clear>${esc(dirLabel)} ${esc(rootName)} (${hopLabel}) <span>&times;</span></button>`;
  }
  box.innerHTML=h;
  box.querySelectorAll(".chip").forEach(ch=>ch.addEventListener("click",()=>{
    if(ch.hasAttribute("data-period-clear")){state.yMin=null;state.yMax=null;render();return;}
    if(ch.hasAttribute("data-inf-clear")){clearInfluenceFilter();render();return;}
    const g=ch.dataset.grp,v=ch.dataset.val;state.filters[g].delete(v);
    const dd=$(`#dd-${g}`);
    const cb=dd.querySelector(`input[value="${CSS.escape(v)}"]`);if(cb)cb.checked=false;
    updBadge(dd,state.filters[g].size);render();
  }));
}



function row(r,ctx){
  ctx=ctx||{topicId:currentDataset(),meta:CFG,filters:FILTERS,crossTopic:false};
  const q=state.q;
  const entryHref=`viewer.html?d=${encodeURIComponent(ctx.topicId)}&id=${encodeURIComponent(r.id)}`;
  const cardTags=(ctx.meta.cardTags||[]).map(ct=>{
    const f=(ctx.filters||[]).find(x=>x.id===ct.id);
    if(!f)return "";
    const v=r[f.key];
    if(v==null||v==="")return "";
    const vals=Array.isArray(v)?v:[v];
    return vals.map(x=>{
      const label=ct.labelKey?(r[ct.labelKey]||x):x;
      return `<button class="tag${ct.cls?" "+ct.cls:""}" data-filter="${esc(f.id)}" data-val="${esc(x)}">${esc(label)}</button>`;
    }).join("");
  }).join("");
  const pop=r.popularity??null;
  const popClass=pop>=75?"pop-high":pop>=50?"pop-mid":"pop-low";
  const popLabel=pop>=75?"Widely read":pop>=50?"Often read":"Less read";
  const popTag=pop===null?"":`<span class="tag popularity ${popClass}" title="Score ${pop}/100 \u00b7 ${formatViews(r.avg_views_per_day)} avg. Wikipedia views/day (10-year window)">${popLabel}</span>`;
  const topicTag=ctx.crossTopic?`<span class="tag topic-label">${esc(ctx.meta.title||ctx.topicId)}</span>`:"";
  const alsoInTag=(ctx.alsoInTopics&&ctx.alsoInTopics.length)
    ?`<span class="tag topic-label" title="Also appears in ${esc(ctx.alsoInTopics.join(", "))}">Also in ${esc(ctx.alsoInTopics.join(", "))}</span>`
    :"";
  const ext=`<svg class="ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 17L17 7M9 7h8v8"/></svg>`;
  return `<div class="row">
    <div class="ident">
      <div class="nm" style="display:flex;align-items:flex-start;gap:6px">
        <a class="entry-link" href="${entryHref}" data-id="${esc(r.id)}" data-topic="${esc(ctx.topicId)}" rel="nofollow noreferrer" style="flex:1">${highlight(r.name,q)}</a>
        <button class="fav-btn${FAVS.has(r.name)?' active':''}" data-fav="${esc(r.name)}" title="Favourite" aria-label="Toggle favourite">★</button>
      </div>
      <div class="dt">${esc(r.dates||"")}<a href="${r.url}" target="_blank" rel="noopener" aria-label="Wikipedia">${ext}</a>${r.sep_url?`<a class="sep-link" href="${r.sep_url}" target="_blank" rel="noopener" aria-label="Stanford Encyclopedia of Philosophy">SEP</a>`:""}</div>
    </div>
    <div class="body">
      <p class="desc">${highlight(r.desc,q)}</p>
      <div class="tags">${cardTags}${popTag}${topicTag}${alsoInTag}</div>
      ${r.tldr?`<button class="tldr-btn" aria-expanded="false"><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>TL;DR</button><div class="tldr-body">${esc(r.tldr)}</div>`:""}
    </div>
  </div>`;
}

function wireResultCards(box){
  box.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>addFilter(b.dataset.filter,b.dataset.val)));
  box.querySelectorAll(".entry-link").forEach(a=>a.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    if(a.dataset.topic && a.dataset.topic!==currentDataset())return; // foreign topic: let the browser navigate there
    e.preventDefault();
    navigateToEntry(a.dataset.id);
  }));
  box.querySelectorAll("[data-fav]").forEach(b=>b.addEventListener("click",(e)=>{
    e.stopPropagation();
    const name=b.dataset.fav;
    if(FAVS.has(name)){FAVS.delete(name)}else{FAVS.add(name);}
    favSave();
    b.classList.toggle("active",FAVS.has(name));
    if(state.showFavs)render();
    updFavFilter();
  }));
  box.querySelectorAll(".tldr-btn").forEach(btn=>btn.addEventListener("click",()=>{
    const exp=btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded",String(!exp));
  }));
}

// ---- cross-topic search ----
// Opt-in second mode for the existing search box (E2-03). Active only while the "Search all
// topics" checkbox is checked AND the query is non-empty -- an empty query always shows the
// normal single-topic list untouched, and loadCorpus() is never called otherwise.
let crossSearchToken=0;
function crossTopicActive(){ return state.crossTopic && !!state.q; }

function updCrossTopicUI(){
  const active=crossTopicActive();
  document.querySelectorAll("#filterBar .dd-btn").forEach(btn=>{btn.disabled=active;});
  document.querySelectorAll(".view-btn").forEach(btn=>{btn.disabled=active;});
  const note=$("#crossTopicNote");
  if(note)note.hidden=!active;
}

// Which other topics (by title) among the current cross-topic result groups also contain an
// entry sharing this entry's normalised url. Lets a figure hit in two topics read as one
// person, not two unrelated results (E2-04).
function crossSearchAlsoIn(entry,ownTopicId,groups){
  const target=normalizeUrl(entry.url);
  if(!target)return [];
  const titles=[];
  groups.forEach((g,tid)=>{
    if(tid===ownTopicId)return;
    if(g.entries.some(e=>normalizeUrl(e.url)===target))titles.push(g.meta.title||tid);
  });
  return titles;
}

async function renderCrossTopicSearch(){
  const token=++crossSearchToken;
  const box=$("#results");
  box.innerHTML=`<div class="cross-search-loading">Searching all topics\u2026</div>`;
  $("#activeTags").innerHTML="";
  const corpus=await loadCorpus();
  if(token!==crossSearchToken)return; // a later keystroke/toggle superseded this call

  const q=state.q;
  const topicId=currentDataset();
  const byName=(a,b)=>a.name.toLowerCase()<b.name.toLowerCase()?-1:1;
  const groups=new Map();
  groups.set(topicId,{topicId,meta:CFG,filters:FILTERS,
    entries:DATA.filter(r=>searchTextWithKeys(r,searchKeysFor(CFG)).includes(q)).sort(byName)});
  const rawByTopic=new Map();
  corpus.forEach(c=>{
    if(!rawByTopic.has(c.topic))rawByTopic.set(c.topic,{meta:c.meta,entries:[]});
    rawByTopic.get(c.topic).entries.push(c.entry);
  });
  rawByTopic.forEach(({meta,entries},tid)=>{
    groups.set(tid,{topicId:tid,meta,filters:meta.filters||[],
      entries:entries.filter(e=>searchTextWithKeys(e,searchKeysFor(meta)).includes(q)).sort(byName)});
  });

  const orderedIds=TOPICS.map(t=>t.id).filter(id=>groups.has(id)&&groups.get(id).entries.length);
  const totalHits=orderedIds.reduce((n,id)=>n+groups.get(id).entries.length,0);
  $("#cnt").textContent=totalHits;
  $("#itemNoun").textContent="results across topics";

  if(!orderedIds.length){
    box.innerHTML=`<div class="empty"><h3>No results match \u201c${esc(q)}\u201d in any topic.</h3>
      <p>Try a different search term.</p></div>`;
  }else{
    let h="";
    orderedIds.forEach(id=>{
      const g=groups.get(id);
      h+=`<div class="era-head">${esc(g.meta.title||id)}<span class="n">${g.entries.length}</span></div>`;
      h+=g.entries.map(r=>{
        const alsoInTopics=crossSearchAlsoIn(r,id,groups);
        return row(r,{topicId:id,meta:g.meta,filters:g.filters,crossTopic:id!==topicId,alsoInTopics});
      }).join("");
    });
    box.innerHTML=h;
    wireResultCards(box);
  }
  encodeHash();updClearFiltersBtn();
}
// ---- end cross-topic search ----

// Fallback timeline lane colors when a topic doesn't supply its own per-value map.
const TL_PALETTE=["#8b5e34","#2f6fb0","#9a7b3f","#b35d38","#7a8f35","#b15f88",
  "#6d63a8","#bd4b6b","#3f8a75","#5576a8","#b1742f","#7b6b58","#3f6f63","#a85f3f"];

const yearLabel=y=>y<0?`${Math.abs(y)} BCE`:`${y} CE`;

function timelineTicks(min,max){
  const span=max-min;
  const step=span>2200?500:span>1000?250:span>420?100:span>180?50:25;
  const start=Math.ceil(min/step)*step;
  const ticks=[];
  for(let y=start;y<=max;y+=step)ticks.push(y);
  return ticks;
}

function timelineItemClass(r,recs){
  if((r.popularity||0)>=75)return "popular";
  if((r.popularity||0)>=50)return "mid";
  return recs.length>90?"dot-only":"";
}

function renderTimeline(recs){
  const prevScroll=document.getElementById("timelineScroller")?.scrollLeft||0;
  const sorted=[...recs].sort((a,b)=>a.y-b.y||(a.name<b.name?-1:1));
  const years=sorted.map(r=>r.y).filter(y=>Number.isFinite(y));
  if(!years.length){
    $("#results").innerHTML=`<div class="empty"><h3>No timeline dates available.</h3>
      <p>Try a broader filter or switch back to the list view.</p></div>`;
    return;
  }
  const min=Math.min(...years), max=Math.max(...years);
  const pad=Math.max(20,Math.round((max-min)*0.035));
  const start=min-pad, end=max+pad, span=Math.max(1,end-start);
  const laneFilter=filterById(CFG.timelineLaneFilterId)||groupFilter()||FILTERS[0];
  const laneKey=laneFilter?laneFilter.key:null;
  const laneOpts=laneFilter?(laneFilter.options||[]):[];
  const laneColors=(laneFilter&&laneFilter.colors)||{};
  const lanes=laneKey
    ? laneOpts.map(t=>[t,sorted.filter(r=>r[laneKey]===t)]).filter(([,items])=>items.length)
    : [["All",sorted]];
  const axis=timelineTicks(start,end).map(y=>{
    const x=((y-start)/span)*100;
    return `<div class="time-tick" style="left:${x}%"><span>${yearLabel(y)}</span></div>`;
  }).join("");
  const topicId=currentDataset();
  const laneHtml=lanes.map(([trad,items],li)=>{
    const color=laneColors[trad]||TL_PALETTE[li%TL_PALETTE.length];
    const points=items.map(r=>{
      const x=((r.y-start)/span)*100;
      const cls=timelineItemClass(r,recs);
      const entryHref=`viewer.html?d=${encodeURIComponent(topicId)}&id=${encodeURIComponent(r.id)}`;
      return `<a class="timeline-item ${cls}" href="${entryHref}" rel="nofollow noreferrer"
        data-name="${esc(r.name)}" data-id="${esc(r.id)}" style="left:${x}%;top:50%;--c:${color}">
        <span class="timeline-dot"></span>
      </a>`;
    }).join("");
    return `<div class="timeline-lane">
      <div class="lane-label">${esc(trad)} <span style="font-weight:500;color:var(--ink-soft)">(${items.length})</span></div>
      <div class="lane-track">${points}</div>
    </div>`;
  }).join("");
  const showingLabels="Hover any point for details.";
  $("#results").innerHTML=`<div class="timeline-wrap">
    <div class="timeline-head">
      <div>
        <h2 class="timeline-title">Timeline</h2>
        <div class="timeline-sub">${yearLabel(min)} to ${yearLabel(max)} · ${lanes.length} ${laneFilter?esc((laneFilter.label||"group").toLowerCase()+"s"):"lanes"} · ${showingLabels}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:10px">
        <div class="timeline-legend">
          <span class="legend-chip">Position = birth or flourishing year · Size = popularity</span>
        </div>
        <div class="timeline-zoom">
          <label for="tlZoom">Zoom</label>
          <input class="zoom-range" id="tlZoom" type="range" min="1" max="10" step="0.1"
            value="${tlZoomLevel}" aria-label="Timeline zoom">
        </div>
      </div>
    </div>
    <div class="timeline-scroller" id="timelineScroller">
      <div class="timeline-board" id="timelineBoard" style="min-width:${tlBoardWidth}px">
        <div class="timeline-axis">${axis}</div>
        ${laneHtml}
      </div>
    </div>
  </div>`;
  wireTimeline();
  wireTimelineResizer();
  if(prevScroll){
    requestAnimationFrame(()=>{const s=document.getElementById("timelineScroller");if(s)s.scrollLeft=prevScroll;});
  }
}

function moveTimelineTip(e){
  const tip=$("#timelineTip");
  const gap=16;
  const rect=tip.getBoundingClientRect();
  let baseX=e.clientX, baseY=e.clientY;
  if(!Number.isFinite(baseX)||!Number.isFinite(baseY)){
    const targetRect=e.currentTarget.getBoundingClientRect();
    baseX=targetRect.left+targetRect.width/2;
    baseY=targetRect.bottom;
  }
  let x=baseX+gap, y=baseY+gap;
  if(x+rect.width>window.innerWidth-10)x=baseX-rect.width-gap;
  if(y+rect.height>window.innerHeight-10)y=baseY-rect.height-gap;
  tip.style.left=Math.max(10,x)+"px";
  tip.style.top=Math.max(10,y)+"px";
}

function showTimelineTip(r,e){
  const tip=$("#timelineTip");
  const tags=r.fields.slice(0,3).map(f=>`<span class="tip-tag">${esc(f)}</span>`).join("");
  tip.innerHTML=`<div class="tip-name">${esc(r.name)}</div>
    <div class="tip-meta">${esc(r.dates)} · ${esc(r.trad)}</div>
    <p class="tip-desc">${esc(r.tldr||r.desc)}</p>
    <div class="tip-tags">${tags}</div>`;
  tip.classList.add("show");
  tip.setAttribute("aria-hidden","false");
  moveTimelineTip(e);
}

function hideTimelineTip(){
  const tip=$("#timelineTip");
  tip.classList.remove("show");
  tip.setAttribute("aria-hidden","true");
}

function wireTimeline(){
  const lookup=new Map(DATA.map(r=>[r.name,r]));
  $("#results").querySelectorAll(".timeline-item").forEach(item=>{
    const show=e=>{
      const r=lookup.get(item.dataset.name);
      if(r)showTimelineTip(r,e);
    };
    item.addEventListener("mouseenter",show);
    item.addEventListener("mouseover",show);
    item.addEventListener("pointerenter",show);
    item.addEventListener("pointerover",show);
    item.addEventListener("mousemove",moveTimelineTip);
    item.addEventListener("pointermove",moveTimelineTip);
    item.addEventListener("mouseleave",hideTimelineTip);
    item.addEventListener("pointerleave",hideTimelineTip);
    item.addEventListener("focus",e=>{
      const r=lookup.get(item.dataset.name);
      if(r)showTimelineTip(r,e);
    });
    item.addEventListener("blur",hideTimelineTip);
    item.addEventListener("click",e=>{
      if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
      e.preventDefault();
      navigateToEntry(item.dataset.id);
    });
  });

  const scroller=document.getElementById("timelineScroller");
  if(scroller){
    scroller.addEventListener("mousedown",e=>{
      if(e.target.closest(".timeline-item"))return;
      activeScroller=scroller;
      dragging=true; moved=false;
      startX=e.clientX; startScroll=scroller.scrollLeft;
      scroller.style.cursor="grabbing";
      e.preventDefault();
    });
    scroller.addEventListener("click",e=>{
      if(moved)e.stopPropagation();
    },true);

    scroller.addEventListener("wheel",e=>{
      if(!e.ctrlKey&&Math.abs(e.deltaX)>Math.abs(e.deltaY))return; // let horizontal scroll pass
      e.preventDefault();
      const board=document.getElementById("timelineBoard");
      if(!board)return;
      // fraction of board width under the pointer before zoom
      const pointerFrac=(scroller.scrollLeft+e.clientX-scroller.getBoundingClientRect().left)/board.scrollWidth;
      const delta=e.deltaY||e.deltaX;
      const factor=e.ctrlKey?0.005:0.003;
      tlZoomLevel=Math.max(1,Math.min(10,tlZoomLevel-delta*factor));
      tlBoardWidth=tlZoomToWidth(tlZoomLevel);
      board.style.minWidth=tlBoardWidth+"px";
      // sync slider
      const slider=document.getElementById("tlZoom");
      if(slider)slider.value=tlZoomLevel;
      // scroll so pointer stays over same point
      requestAnimationFrame(()=>{
        scroller.scrollLeft=pointerFrac*board.scrollWidth-( e.clientX-scroller.getBoundingClientRect().left);
      });
    },{passive:false});
  }
}

let dragging=false,startX=0,startScroll=0,moved=false,activeScroller=null;
document.addEventListener("mousemove",e=>{
  if(!dragging||!activeScroller)return;
  const dx=e.clientX-startX;
  if(Math.abs(dx)>3)moved=true;
  if(moved)activeScroller.scrollLeft=startScroll-dx;
});
document.addEventListener("mouseup",()=>{
  if(!dragging||!activeScroller)return;
  dragging=false;
  activeScroller.style.cursor="";
  activeScroller=null;
});

let tlZoomLevel=3;
const TL_BASE=800;
function tlZoomToWidth(z){ return Math.round(TL_BASE*Math.pow(z,1.7)); }
let tlBoardWidth=tlZoomToWidth(tlZoomLevel);

function wireTimelineResizer(){
  const slider=document.getElementById("tlZoom");
  if(!slider)return;
  slider.addEventListener("input",()=>{
    const scroller=document.getElementById("timelineScroller");
    const board=document.getElementById("timelineBoard");
    if(!scroller||!board)return;
    // capture center fraction before resize
    const centerFrac=(scroller.scrollLeft+scroller.clientWidth/2)/board.scrollWidth;
    tlZoomLevel=parseFloat(slider.value);
    tlBoardWidth=tlZoomToWidth(tlZoomLevel);
    board.style.minWidth=tlBoardWidth+"px";
    // restore center
    requestAnimationFrame(()=>{
      scroller.scrollLeft=centerFrac*board.scrollWidth-scroller.clientWidth/2;
    });
  });
}

function render(){
  const inLineage=state.mode==="lineage";
  const inQuiz=state.mode==="quiz";
  const inCards=state.mode==="cards";
  document.body.classList.toggle("lineage-mode",inLineage);
  document.body.classList.toggle("quiz-mode",inQuiz);
  document.body.classList.toggle("cards-mode",inCards);
  document.body.classList.toggle("detail-mode",!inLineage&&!inQuiz&&!inCards&&!!state.entryId);
  if(inLineage){
    renderLineage();
    return;
  }
  if(inQuiz){
    renderQuiz();
    return;
  }
  if(inCards){
    renderCards();
    return;
  }
  if(state.entryId){
    renderDetail();
    return;
  }
  document.title=CFG.title||"Index";
  updCrossTopicUI();
  if(crossTopicActive()){
    renderCrossTopicSearch();
    return;
  }
  let recs=DATA.filter(match);
  recs=state.view==="timeline"?[...recs].sort((x,y)=>x.y-y.y||(x.name<y.name?-1:1)):sortRecs(recs);
  $("#cnt").textContent=recs.length;
  $("#itemNoun").textContent=CFG.itemNoun||"";
  renderActiveTags();
  const box=$("#results");
  if(!recs.length){
    box.innerHTML=`<div class="empty"><h3>No ${esc(CFG.itemNoun||"results")} match.</h3>
      <p>Try removing a filter or broadening your search.</p>
      <button id="resetAll">Reset everything</button></div>`;
    $("#resetAll").addEventListener("click",resetAll);
    encodeHash();updClearFiltersBtn();return;
  }
  hideTimelineTip();
  if(state.view==="timeline"){
    renderTimeline(recs);
    encodeHash();updClearFiltersBtn();return;
  }
  let h="";
  if((state.sort==="old"||state.sort==="new") && groupFilter()){
    const gf=groupFilter();
    const order=state.sort==="old"?gf.options:[...gf.options].reverse();
    order.forEach(g=>{
      const grp=recs.filter(r=>r[gf.key]===g);
      if(!grp.length)return;
      h+=`<div class="era-head">${esc(g)}<span class="n">${grp.length}</span></div>`;
      h+=grp.map(r=>row(r)).join("");
    });
  }else if(state.sort==="az"){
    let lastLetter="";
    recs.forEach(r=>{
      const letter=(r.name[0]||"").toUpperCase();
      if(letter!==lastLetter){lastLetter=letter;h+=`<div class="era-head alpha-head">${esc(letter)}</div>`;}
      h+=row(r);
    });
  }else{
    h=recs.map(r=>row(r)).join("");
  }
  box.innerHTML=h;
  wireResultCards(box);
  encodeHash();updClearFiltersBtn();
}

function addFilter(grp,val){
  const sel=state.filters[grp];
  if(!sel||sel.has(val))return;
  sel.add(val);
  const dd=$(`#dd-${grp}`);const cb=dd.querySelector(`input[value="${CSS.escape(val)}"]`);
  if(cb)cb.checked=true;updBadge(dd,sel.size);
  window.scrollTo({top:0,behavior:"smooth"});render();
}

function resetAll(){
  state.q="";FILTERS.forEach(f=>state.filters[f.id].clear());
  state.showFavs=false;
  state.yMin=null;state.yMax=null;
  clearInfluenceFilter();
  $("#q").value="";
  document.querySelectorAll('.panel input[type=checkbox]').forEach(c=>c.checked=false);
  document.querySelectorAll(".dd").forEach(d=>updBadge(d,0));
  updFavFilter();
  render();
}

function buildGlossSelect(selId, glossary) {
  const sel = document.getElementById(selId);
  Object.keys(glossary).sort().forEach(k => {
    const o = document.createElement("option");
    o.value = k; o.textContent = k;
    sel.appendChild(o);
  });
}

function wireGloss(selId, descId, glossary) {
  const sel = document.getElementById(selId);
  const desc = document.getElementById(descId);
  sel.addEventListener("change", () => {
    desc.textContent = glossary[sel.value] || "";
  });
}
// ---- end glossary ----



// ---- random entry ----
const RAND_KEY = "phil_seen_v1";
function randLoad(){ try{ return new Set(JSON.parse(localStorage.getItem(RAND_KEY)||"[]")); } catch(e){ return new Set(); } }
function randSave(s){ try{ localStorage.setItem(RAND_KEY, JSON.stringify([...s])); } catch(e){} }

function randUpdateUI(){
  const seen = randLoad();
  const clr  = $("#randClear");
  clr.hidden = seen.size === 0;
  $("#randSeenCount").textContent = seen.size;
  $("#randExhausted").hidden = true;
}
randUpdateUI();

$("#randBtn").addEventListener("click", () => {
  const candidates = DATA.filter(match);
  if (!candidates.length) return;

  const noRepeats = $("#randNoRepeats").checked;
  const seen = randLoad();
  let pool = candidates;

  if (noRepeats) {
    pool = candidates.filter(r => !seen.has(r.name));
    if (!pool.length) { $("#randExhausted").hidden = false; return; }
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];

  seen.add(pick.name);
  randSave(seen);
  randUpdateUI();

  navigateToEntry(pick.id);
});

$("#randClear").addEventListener("click", () => {
  randSave(new Set());
  randUpdateUI();
});
// ---- end random entry ----

// ---- favourites ----
const FAV_KEY = "phil_favs_v1";
function favLoad(){ try{ return new Set(JSON.parse(localStorage.getItem(FAV_KEY)||"[]")); } catch(e){ return new Set(); } }
function favSave(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify([...FAVS])); } catch(e){} }
const FAVS = favLoad();

function updFavFilter(){
  $("#favFilterBtn").classList.toggle("active", state.showFavs);
}

$("#favFilterBtn").addEventListener("click", () => {
  state.showFavs = !state.showFavs;
  updFavFilter();
  render();
});

// ---- end favourites ----

// ---- view mode ----
function updViewToggle(){
  document.querySelectorAll(".view-btn").forEach(btn=>{
    const active=btn.dataset.view===state.view;
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-pressed",String(active));
  });
  hideTimelineTip();
}

document.querySelectorAll(".view-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    state.view=btn.dataset.view;
    updViewToggle();
    render();
  });
});
// ---- end view mode ----

// ---- clear filters ----
function updClearFiltersBtn(){
  const hasFilters = state.q || state.showFavs || state.yMin!=null || state.infRoot || FILTERS.some(f=>state.filters[f.id].size);
  $("#clearFiltersBtn").disabled = !hasFilters;
}
$("#clearFiltersBtn").addEventListener("click", () => { if (!$("#clearFiltersBtn").disabled) resetAll(); });
// ---- end clear filters ----

// ---- share / deeplink ----
// Encode current filter state into the URL hash. Filter ids become hash keys, e.g.
//   #q=Kant&fields=Ethics,Logic&trads=Analytic&eras=19th+century&favs=1&view=timeline
// All values are encodeURIComponent-safe. Comma-separated for multi-select.
// minY/maxY (a plain year range, not tied to any filter id) are set by the "Meanwhile"
// section's "see all" link (E2-02) to open a topic's list view filtered to a period.
function encodeHash(){
  if (state.entryId || state.mode) return; // filter state does not belong in an entity/lineage URL
  const parts = [];
  if (state.q)              parts.push("q="      + encodeURIComponent(state.q));
  if (state.crossTopic)     parts.push("all=1");
  FILTERS.forEach(f=>{
    const sel=state.filters[f.id];
    if(sel.size) parts.push(f.id+"="+[...sel].map(encodeURIComponent).join(","));
  });
  if (state.showFavs)       parts.push("favs=1");
  if (state.yMin!=null)     parts.push("minY="   + encodeURIComponent(state.yMin));
  if (state.yMax!=null)     parts.push("maxY="   + encodeURIComponent(state.yMax));
  if (state.infRoot)        parts.push("inf="    + encodeURIComponent(state.infRoot) + ":" + state.infDir + ":" + state.infDepth);
  if (state.view !== "list") parts.push("view="   + encodeURIComponent(state.view));
  history.replaceState(null,"", parts.length ? "#" + parts.join("&") : location.pathname + location.search);
}

async function decodeHash(){
  const hash = location.hash.slice(1);
  if (!hash) return;
  const params = {};
  hash.split("&").forEach(p => {
    const [k,...rest] = p.split("=");
    params[k] = decodeURIComponent(rest.join("="));
  });
  if (params.q){
    state.q = params.q.toLowerCase();
    $("#q").value = params.q;
  }
  if (params.all === "1"){
    state.crossTopic = true;
    $("#allTopicsToggle").checked = true;
  }
  FILTERS.forEach(f=>{
    if(!params[f.id])return;
    const dd=$(`#dd-${f.id}`);
    params[f.id].split(",").forEach(v=>{
      state.filters[f.id].add(v);
      const cb=dd.querySelector(`input[value="${CSS.escape(v)}"]`);
      if(cb)cb.checked=true;
    });
    updBadge(dd,state.filters[f.id].size);
  });
  if (params.favs === "1"){
    state.showFavs = true;
    updFavFilter();
  }
  if (params.minY!==undefined && params.maxY!==undefined){
    const min=Number(params.minY), max=Number(params.maxY);
    if(Number.isFinite(min) && Number.isFinite(max)){ state.yMin=min; state.yMax=max; }
  }
  if (params.inf){
    const [rootId,dir,depthStr]=params.inf.split(":");
    const depth=Number(depthStr);
    const validDir=dir==="upstream"||dir==="downstream"||dir==="both";
    if(rootId && DATA.some(r=>r.id===rootId) && validDir && (depth===1||depth===2)){
      await setInfluenceFilter(rootId,dir,depth);
    }
  }
  if (params.view === "timeline"){
    state.view = "timeline";
    updViewToggle();
  }
  render();
}
// Copy link button
$("#copyLinkBtn").addEventListener("click", () => {
  encodeHash();
  navigator.clipboard.writeText(location.href).then(() => {
    const btn = $("#copyLinkBtn");
    const span = btn.querySelector("span");
    const orig = span.textContent;
    span.textContent = "Copied!";
    setTimeout(() => { span.textContent = orig; }, 1500);
  });
});
// ---- end share / deeplink ----

// ---- entity routing ----
// Entity detail pages are addressed via a query param (?d=<topic>&id=<entry-id>), never the
// hash — the hash stays reserved for list-view filter state (see encodeHash/decodeHash above).
function currentEntry(){
  return DATA.find(r=>r.id===state.entryId)||null;
}

// Neighbours are defined by the current filter/sort state (match+sortRecs), not the full
// topic. Returns null when the entry isn't in that result set (e.g. a bare entity URL).
function detailNeighbors(r){
  const recs=sortRecs(DATA.filter(match));
  const idx=recs.findIndex(x=>x.id===r.id);
  if(idx<0)return null;
  return {idx,total:recs.length,prev:idx>0?recs[idx-1]:null,next:idx<recs.length-1?recs[idx+1]:null};
}

function readEntryIdFromUrl(){
  const id=new URLSearchParams(location.search).get("id");
  if(!id){state.entryId=null;return;}
  if(DATA.some(r=>r.id===id)){
    state.entryId=id;
  }else{
    state.entryId=null;
    console.warn(`Entity routing: no entry with id "${id}" in this topic.`);
  }
}

function navigateToEntry(id){
  state.entryId=id;
  state.mode=null;
  state.lineageFrom=null;
  state.lineageTo=null;
  state.lineageUndirected=false;
  quizRound=null;
  cardsSession=null;
  const url=new URL(location.href);
  url.searchParams.set("id",id);
  url.searchParams.delete("mode");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  url.searchParams.delete("undirected");
  url.hash="";
  history.pushState(null,"",url.pathname+url.search);
  render();
}

function navigateToList(){
  state.entryId=null;
  state.mode=null;
  state.lineageFrom=null;
  state.lineageTo=null;
  state.lineageUndirected=false;
  quizRound=null;
  cardsSession=null;
  const url=new URL(location.href);
  url.searchParams.delete("id");
  url.searchParams.delete("mode");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  url.searchParams.delete("undirected");
  url.hash="";
  history.pushState(null,"",url.pathname+url.search);
  render();
}

window.addEventListener("popstate",()=>{
  readEntryIdFromUrl();
  readModeFromUrl();
  render();
});
// ---- end entity routing ----

// ---- entity detail view ----
// Data-agnostic: driven entirely by CFG (the topic's meta block) and the entry's own
// keys, same way the list view is. Do not special-case any topic here.
function renderDetail(){
  const r=currentEntry();
  if(!r)return;
  const chips=(CFG.cardTags||[]).map(ct=>{
    const f=filterById(ct.id);
    if(!f)return "";
    const v=r[f.key];
    if(v==null||v==="")return "";
    const vals=Array.isArray(v)?v:[v];
    return vals.map(x=>{
      const label=ct.labelKey?(r[ct.labelKey]||x):x;
      return `<button class="tag${ct.cls?" "+ct.cls:""}" data-filter="${esc(f.id)}" data-val="${esc(x)}">${esc(label)}</button>`;
    }).join("");
  }).join("");
  let popHtml="";
  if(CFG.popularity && r.popularity!=null){
    const popLabel=r.popularity>=75?"Widely read":r.popularity>=50?"Often read":"Less read";
    popHtml=`<div class="detail-pop">${esc(popLabel)} · ${esc(formatViews(r.avg_views_per_day))} avg. Wikipedia views/day</div>`;
  }
  const wikiLink=r.url?`<a class="detail-link" href="${esc(r.url)}" target="_blank" rel="noopener">Wikipedia &rarr;</a>`:"";
  const sepLink=r.sep_url?`<a class="detail-link" href="${esc(r.sep_url)}" target="_blank" rel="noopener">Stanford Encyclopedia of Philosophy &rarr;</a>`:"";
  const nav=detailNeighbors(r);
  const navHtml=nav?`<nav class="detail-nav" aria-label="${esc(CFG.itemNoun||"results")} navigation">
    <button class="detail-nav-btn" id="detailPrev" ${nav.prev?"":"disabled"}>
      <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      <span class="nav-label">${nav.prev?esc(nav.prev.name):"Previous"}</span>
    </button>
    <div class="detail-nav-pos">${nav.idx+1} of ${nav.total} ${esc(CFG.itemNoun||"")}</div>
    <button class="detail-nav-btn" id="detailNext" ${nav.next?"":"disabled"}>
      <span class="nav-label">${nav.next?esc(nav.next.name):"Next"}</span>
      <svg class="nav-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
    </button>
  </nav>`:"";
  $("#detail").innerHTML=`
    <a href="#" class="detail-back" id="detailBack">&larr; All ${esc(CFG.itemNoun||"")}</a>
    <h1 class="detail-name">${esc(r.name)}</h1>
    <div class="detail-dates">${esc(r.dates||"")}</div>
    <div class="tags detail-tags">${chips}</div>
    ${r.desc?`<p class="detail-desc">${esc(r.desc)}</p>`:""}
    ${r.tldr?`<p class="detail-tldr">${esc(r.tldr)}</p>`:""}
    ${popHtml}
    <div class="detail-links">${wikiLink}${sepLink}</div>
    <!-- Insertion point for later epics: contemporaries (E2-02), influences (E3-02). Each -->
    <!-- feature owns its own sub-container so their async renders never clobber each other. -->
    <div id="detail-extras"><div id="detail-influences"></div><div id="detail-meanwhile"></div></div>
    ${navHtml}
  `;
  document.title=`${r.name} — ${CFG.title||""}`;
  $("#detailBack").addEventListener("click",e=>{e.preventDefault();navigateToList();});
  $("#detail").querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{
    navigateToList();
    addFilter(b.dataset.filter,b.dataset.val);
  }));
  if(nav){
    if(nav.prev)$("#detailPrev").addEventListener("click",()=>navigateToEntry(nav.prev.id));
    if(nav.next)$("#detailNext").addEventListener("click",()=>navigateToEntry(nav.next.id));
  }
  renderInfluences(r); // fires after the entry itself has painted; never awaited here
  renderMeanwhile(r); // fires after the entry itself has painted; never awaited here
}

function isTypingTarget(el){
  if(!el)return false;
  return el.tagName==="INPUT"||el.tagName==="TEXTAREA"||el.tagName==="SELECT"||el.isContentEditable;
}

document.addEventListener("keydown",e=>{
  if(!state.entryId||(e.key!=="ArrowLeft"&&e.key!=="ArrowRight"))return;
  if(isTypingTarget(document.activeElement))return;
  const r=currentEntry();
  const nav=r&&detailNeighbors(r);
  if(!nav)return;
  const target=e.key==="ArrowLeft"?nav.prev:nav.next;
  if(!target)return;
  e.preventDefault();
  navigateToEntry(target.id);
});
// ---- end entity detail view ----

// ---- influences ----
// Who influenced this entry and who it influenced, from the edges E3-01 fetched from
// Wikidata (data/influences.json). Rendered above the Meanwhile section, into its own
// sub-container so the two features' independent async fetches never clobber each other.
let _influences=null;
let _influencesPromise=null;
async function loadInfluences(){
  if(_influences)return _influences;
  if(_influencesPromise)return _influencesPromise;
  _influencesPromise=fetch("data/influences.json")
    .then(r=>{ if(!r.ok)throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(d=>{ _influences=Array.isArray(d.edges)?d.edges:[]; return _influences; })
    .catch(err=>{
      console.warn("Could not load data/influences.json.",err);
      _influences=[];
      return _influences;
    });
  return _influencesPromise;
}

const INFLUENCE_MAX_SHOWN=12;

function influenceGroupHtml(label,ids,topicId){
  const entries=ids.map(id=>DATA.find(e=>e.id===id)).filter(Boolean)
    .sort((a,b)=>(Number.isFinite(a.y)?a.y:Infinity)-(Number.isFinite(b.y)?b.y:Infinity)||(a.name<b.name?-1:1));
  if(!entries.length)return "";
  const shown=entries.slice(0,INFLUENCE_MAX_SHOWN);
  const rest=entries.slice(INFLUENCE_MAX_SHOWN);
  const itemHtml=e=>`<li class="influence-item">
    <a href="viewer.html?d=${encodeURIComponent(topicId)}&id=${encodeURIComponent(e.id)}" data-id="${esc(e.id)}">${esc(e.name)}</a>
    <span class="influence-item-dates">${esc(e.dates||"")}</span>
  </li>`;
  const restHtml=rest.length
    ? `<ul class="influence-list influence-list-rest" hidden>${rest.map(itemHtml).join("")}</ul>
       <button class="influence-more-btn" aria-expanded="false" data-total="${entries.length}">Show all ${entries.length}</button>`
    : "";
  return `<div class="influence-group">
    <h3 class="influence-heading">${esc(label)} <span class="influence-count">(${entries.length})</span></h3>
    <ul class="influence-list">${shown.map(itemHtml).join("")}</ul>
    ${restHtml}
  </div>`;
}

let influencesToken=0; // bumped on every call so a stale fetch can't clobber a newer entry

async function renderInfluences(r){
  const box=$("#detail-influences");
  if(!box)return;
  const token=++influencesToken;
  const edges=await loadInfluences();
  if(token!==influencesToken)return; // a later navigation superseded this call

  const topicId=currentDataset();
  const influencedByIds=edges.filter(e=>e.topic===topicId&&e.to===r.id).map(e=>e.from);
  const influencedIds=edges.filter(e=>e.topic===topicId&&e.from===r.id).map(e=>e.to);
  const byHtml=influenceGroupHtml("Influenced by",influencedByIds,topicId);
  const ofHtml=influenceGroupHtml("Influenced",influencedIds,topicId);
  if(!byHtml&&!ofHtml){box.innerHTML="";return;}

  const downstreamLink=influencedIds.length
    ?`<a class="influence-filter-link" id="infDownstreamLink" href="viewer.html?d=${encodeURIComponent(topicId)}#inf=${encodeURIComponent(r.id)}:downstream:1">Show everyone they influenced &rarr;</a>`
    :"";
  const upstreamLink=influencedByIds.length
    ?`<a class="influence-filter-link" id="infUpstreamLink" href="viewer.html?d=${encodeURIComponent(topicId)}#inf=${encodeURIComponent(r.id)}:upstream:1">Show everyone who influenced them &rarr;</a>`
    :"";
  box.innerHTML=`<div class="influences">${byHtml}${ofHtml}
    <div class="influence-quick-links">${downstreamLink}${upstreamLink}</div>
    <a class="lineage-link" id="lineageFromHereLink" href="viewer.html?d=${encodeURIComponent(topicId)}&mode=lineage&from=${encodeURIComponent(r.id)}">Trace a lineage from here &rarr;</a>
  </div>`;
  box.querySelectorAll(".influence-item a").forEach(a=>a.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToEntry(a.dataset.id);
  }));
  const infDownstreamLink=$("#infDownstreamLink");
  if(infDownstreamLink)infDownstreamLink.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToInfluenceFilter(r.id,"downstream");
  });
  const infUpstreamLink=$("#infUpstreamLink");
  if(infUpstreamLink)infUpstreamLink.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToInfluenceFilter(r.id,"upstream");
  });
  box.querySelectorAll(".influence-more-btn").forEach(btn=>btn.addEventListener("click",()=>{
    const exp=btn.getAttribute("aria-expanded")==="true";
    btn.setAttribute("aria-expanded",String(!exp));
    btn.previousElementSibling.hidden=exp;
    btn.textContent=exp?`Show all ${btn.dataset.total}`:"Show fewer";
  }));
  const lineageLink=$("#lineageFromHereLink");
  if(lineageLink)lineageLink.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToLineage(r.id,null);
  });
}
// ---- end influences ----

// ---- influence filter ----
// Optional list-view constraint (E3-04): only show entries reachable from state.infRoot
// within state.infDepth hops in state.infDir ("upstream", "downstream", or "both"). Reuses
// the edges E3-01 fetched (data/influences.json) via loadInfluences(). match() must stay
// synchronous, so infReachableSet is precomputed here whenever the constraint changes and
// simply looked up during filtering.
let infReachableSet=null;

function influenceReachable(rootId,direction,depth,edges){
  const forward=new Map(), backward=new Map();
  edges.forEach(e=>{
    if(!forward.has(e.from))forward.set(e.from,[]);
    forward.get(e.from).push(e.to);
    if(!backward.has(e.to))backward.set(e.to,[]);
    backward.get(e.to).push(e.from);
  });
  const result=new Set([rootId]);
  let frontier=[rootId];
  for(let hop=0;hop<depth;hop++){
    const next=[];
    frontier.forEach(id=>{
      const neighbors=[];
      if(direction!=="upstream")neighbors.push(...(forward.get(id)||[]));
      if(direction!=="downstream")neighbors.push(...(backward.get(id)||[]));
      neighbors.forEach(n=>{ if(!result.has(n)){result.add(n);next.push(n);} });
    });
    frontier=next;
    if(!frontier.length)break;
  }
  return result;
}

async function computeInfReachableSet(){
  if(!state.infRoot){ infReachableSet=null; return; }
  const edges=(await loadInfluences()).filter(e=>e.topic===currentDataset());
  infReachableSet=influenceReachable(state.infRoot,state.infDir,state.infDepth,edges);
}

async function setInfluenceFilter(rootId,direction,depth){
  state.infRoot=rootId;
  state.infDir=direction;
  state.infDepth=depth;
  await computeInfReachableSet();
}

function clearInfluenceFilter(){
  state.infRoot=null;state.infDir=null;state.infDepth=null;infReachableSet=null;
}

async function navigateToInfluenceFilter(rootId,direction){
  await setInfluenceFilter(rootId,direction,1);
  navigateToList();
}
// ---- end influence filter ----

// ---- lineage ----
// Third top-level route alongside the list and entity-detail views: how does influence flow
// between two entries, possibly many hops apart? Addressed via
// ?d=<topic>&mode=lineage&from=<id>&to=<id>(&undirected=1), never the hash — same reasoning
// as entity routing above, this state must survive a fresh tab. Reuses the edges E3-01 fetched
// and E3-02's loadInfluences() cache.
function readModeFromUrl(){
  const params=new URLSearchParams(location.search);
  const mode=params.get("mode");
  if(mode==="lineage"){
    state.mode="lineage";
    const f=params.get("from"),t=params.get("to");
    state.lineageFrom=DATA.some(r=>r.id===f)?f:null;
    state.lineageTo=DATA.some(r=>r.id===t)?t:null;
    state.lineageUndirected=params.get("undirected")==="1";
  }else{
    state.lineageFrom=null;state.lineageTo=null;state.lineageUndirected=false;
    state.mode=(mode==="quiz")?"quiz":(mode==="cards")?"cards":null;
  }
  if(state.mode!=="quiz")quizRound=null; // round state never lives in the URL, only the stats do
  if(state.mode!=="cards")cardsSession=null; // session state never lives in the URL, only the schedule does
}

function navigateToLineage(fromId,toId){
  state.mode="lineage";
  state.entryId=null;
  state.lineageFrom=fromId||null;
  state.lineageTo=toId||null;
  state.lineageUndirected=false;
  const url=new URL(location.href);
  url.searchParams.set("mode","lineage");
  url.searchParams.delete("id");
  if(state.lineageFrom)url.searchParams.set("from",state.lineageFrom);else url.searchParams.delete("from");
  if(state.lineageTo)url.searchParams.set("to",state.lineageTo);else url.searchParams.delete("to");
  url.searchParams.delete("undirected");
  url.hash="";
  history.pushState(null,"",url.pathname+url.search);
  render();
}

function updateLineageUrl(){
  const url=new URL(location.href);
  url.searchParams.set("mode","lineage");
  url.searchParams.delete("id");
  if(state.lineageFrom)url.searchParams.set("from",state.lineageFrom);else url.searchParams.delete("from");
  if(state.lineageTo)url.searchParams.set("to",state.lineageTo);else url.searchParams.delete("to");
  if(state.lineageUndirected)url.searchParams.set("undirected","1");else url.searchParams.delete("undirected");
  url.hash="";
  history.replaceState(null,"",url.pathname+url.search);
}

const LINEAGE_MAX_HOPS=6;

// Directed adjacency follows the edges the way E3-01 committed them: from is the influencer,
// to is the influenced, so a directed edge points from earlier influence toward what it later
// shaped.
function lineageAdjacency(edges,directed){
  const adj=new Map();
  const add=(a,b)=>{ if(!adj.has(a))adj.set(a,[]); adj.get(a).push(b); };
  edges.forEach(e=>{ add(e.from,e.to); if(!directed)add(e.to,e.from); });
  return adj;
}

// Plain BFS, capped at maxHops. `capped` distinguishes "no path exists" from "the search was
// cut off before it could tell": if the hop-(maxHops+1) frontier is still non-empty when the
// cap bites, a path may exist beyond it that was simply never explored.
function lineageBfs(adj,fromId,toId,maxHops){
  if(fromId===toId)return{found:true,path:[fromId],hops:0};
  const parent=new Map([[fromId,null]]);
  let frontier=[fromId];
  for(let hop=1;hop<=maxHops;hop++){
    const next=[];
    for(const node of frontier){
      for(const nb of (adj.get(node)||[])){
        if(parent.has(nb))continue;
        parent.set(nb,node);
        if(nb===toId){
          const path=[toId];
          let cur=toId;
          while(parent.get(cur)!==null){ cur=parent.get(cur); path.unshift(cur); }
          return{found:true,path,hops:hop};
        }
        next.push(nb);
      }
    }
    frontier=next;
    if(!frontier.length)return{found:false,capped:false};
  }
  return{found:false,capped:frontier.length>0};
}

function lineagePickerHtml(key,label,entry){
  return `<div class="lineage-picker">
    <label class="lineage-picker-label" for="lineage-${key}-input">${esc(label)}</label>
    <input type="text" id="lineage-${key}-input" class="lineage-picker-input" placeholder="Search a name&hellip;"
      autocomplete="off" value="${entry?esc(entry.name):""}">
    <div class="lineage-suggestions" id="lineage-${key}-suggestions" hidden></div>
  </div>`;
}

const LINEAGE_SUGGEST_MAX=8;

function wireLineagePicker(key){
  const input=$(`#lineage-${key}-input`);
  const sugg=$(`#lineage-${key}-suggestions`);
  const showMatches=()=>{
    const q=input.value.trim().toLowerCase();
    if(!q){sugg.hidden=true;sugg.innerHTML="";return;}
    const matches=DATA.filter(r=>r.name.toLowerCase().includes(q)).slice(0,LINEAGE_SUGGEST_MAX);
    if(!matches.length){sugg.hidden=true;sugg.innerHTML="";return;}
    sugg.innerHTML=matches.map(r=>`<button type="button" class="lineage-suggestion" data-id="${esc(r.id)}">
      <span>${esc(r.name)}</span><span class="lineage-suggestion-dates">${esc(r.dates||"")}</span></button>`).join("");
    sugg.hidden=false;
    sugg.querySelectorAll(".lineage-suggestion").forEach(btn=>{
      btn.addEventListener("click",()=>{
        if(key==="from")state.lineageFrom=btn.dataset.id;else state.lineageTo=btn.dataset.id;
        state.lineageUndirected=false;
        updateLineageUrl();
        renderLineage();
      });
    });
  };
  input.addEventListener("input",()=>{
    if(key==="from")state.lineageFrom=null;else state.lineageTo=null;
    updateLineageUrl();
    showMatches();
    renderLineageResult();
  });
  input.addEventListener("focus",showMatches);
  input.addEventListener("blur",()=>{ setTimeout(()=>{sugg.hidden=true;},150); }); // let a click register first
}

let lineageResultToken=0; // bumped on every call so a stale search can't clobber a newer one

async function renderLineageResult(){
  const box=$("#lineage-result");
  if(!box)return;
  const fromEntry=state.lineageFrom&&DATA.find(r=>r.id===state.lineageFrom);
  const toEntry=state.lineageTo&&DATA.find(r=>r.id===state.lineageTo);
  if(!fromEntry||!toEntry){
    box.innerHTML=`<p class="lineage-hint">Pick two ${esc(CFG.itemNoun||"entries")} to trace a path between them.</p>`;
    return;
  }
  if(fromEntry.id===toEntry.id){
    box.innerHTML=`<p class="lineage-hint">Pick two different ${esc(CFG.itemNoun||"entries")}.</p>`;
    return;
  }
  box.innerHTML=`<p class="lineage-hint">Searching&hellip;</p>`;
  const token=++lineageResultToken;
  const topicId=currentDataset();
  const edges=(await loadInfluences()).filter(e=>e.topic===topicId);
  if(token!==lineageResultToken)return; // a later pick superseded this search

  const directed=lineageBfs(lineageAdjacency(edges,true),fromEntry.id,toEntry.id,LINEAGE_MAX_HOPS);
  if(directed.found){ renderLineagePathHtml(directed,false,topicId); return; }
  if(state.lineageUndirected){
    const undirected=lineageBfs(lineageAdjacency(edges,false),fromEntry.id,toEntry.id,LINEAGE_MAX_HOPS);
    renderLineagePathHtml(undirected,true,topicId);
    return;
  }
  const msg=directed.capped
    ? `No directed path found within ${LINEAGE_MAX_HOPS} hops &mdash; a longer one may exist.`
    : `No directed path exists between these two.`;
  box.innerHTML=`<p class="lineage-hint">${msg}</p>
    <button type="button" class="lineage-undirected-btn" id="lineage-try-undirected">Search ignoring direction</button>`;
  $("#lineage-try-undirected").addEventListener("click",()=>{
    state.lineageUndirected=true;
    updateLineageUrl();
    renderLineageResult();
  });
}

function renderLineagePathHtml(result,undirected,topicId){
  const box=$("#lineage-result");
  if(!box)return;
  if(!result.found){
    const msg=result.capped
      ? `No path found even ignoring direction, within ${LINEAGE_MAX_HOPS} hops &mdash; a longer one may exist.`
      : `No path exists between these two, even ignoring direction.`;
    box.innerHTML=`<p class="lineage-hint">${msg}</p>`;
    return;
  }
  const chainHtml=result.path.map((id,i)=>{
    const e=DATA.find(r=>r.id===id);
    const name=e?esc(e.name):esc(id);
    const link=`<a class="lineage-node" href="viewer.html?d=${encodeURIComponent(topicId)}&id=${encodeURIComponent(id)}" data-id="${esc(id)}">${name}</a>`;
    return i<result.path.length-1?link+`<span class="lineage-chain-arrow" aria-hidden="true">&rarr;</span>`:link;
  }).join("");
  box.innerHTML=`
    <div class="lineage-hops">${result.hops} hop${result.hops===1?"":"s"}${undirected?" &middot; undirected":""}</div>
    <div class="lineage-chain">${chainHtml}</div>
    ${undirected?`<p class="lineage-undirected-note">Direction of influence ignored to find this path.</p>`:""}
  `;
  box.querySelectorAll(".lineage-node").forEach(a=>a.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToEntry(a.dataset.id);
  }));
}

function renderLineage(){
  const box=$("#lineage");
  if(!box)return;
  document.title=`Lineage · ${CFG.title||"Index"}`;
  const fromEntry=state.lineageFrom&&DATA.find(r=>r.id===state.lineageFrom);
  const toEntry=state.lineageTo&&DATA.find(r=>r.id===state.lineageTo);
  box.innerHTML=`
    <a href="#" class="detail-back" id="lineageBack">&larr; All ${esc(CFG.itemNoun||"")}</a>
    <h1 class="lineage-title">Lineage</h1>
    <p class="lineage-sub">How does influence flow from one ${esc(CFG.itemNounSingular||"entry")} to another?</p>
    <div class="lineage-pickers">
      ${lineagePickerHtml("from","From",fromEntry)}
      <div class="lineage-arrow" aria-hidden="true">&rarr;</div>
      ${lineagePickerHtml("to","To",toEntry)}
    </div>
    <div class="lineage-result" id="lineage-result"></div>
  `;
  $("#lineageBack").addEventListener("click",e=>{e.preventDefault();navigateToList();});
  wireLineagePicker("from");
  wireLineagePicker("to");
  renderLineageResult();
}
// ---- end lineage ----

// ---- meanwhile ----
// "What else was happening around then" — contemporaries drawn from all three topics,
// rendered into #detail-meanwhile (a sub-container of the insertion point E1-03 left) after
// first paint so it never delays the entry itself. Widens the year window when sparse.
const MEANWHILE_WINDOWS=[25,50,100];
const MEANWHILE_MAX_PER_TOPIC=6;
let meanwhileToken=0; // bumped on every call so a stale fetch can't clobber a newer entry

function meanwhileGroupHtml(topicId,meta,entries,r,minY,maxY){
  const sorted=[...entries].sort((a,b)=>Math.abs(a.y-r.y)-Math.abs(b.y-r.y)||(a.name<b.name?-1:1));
  const shown=sorted.slice(0,MEANWHILE_MAX_PER_TOPIC);
  const itemsHtml=shown.map(e=>{
    const href=`viewer.html?d=${encodeURIComponent(topicId)}&id=${encodeURIComponent(e.id)}`;
    return `<a class="meanwhile-item" href="${href}">
      <span class="meanwhile-item-name">${esc(e.name)}</span>
      <span class="meanwhile-item-dates">${esc(e.dates||"")}</span>
      <span class="meanwhile-item-desc">${esc(e.desc||"")}</span>
    </a>`;
  }).join("");
  const moreHtml = sorted.length>MEANWHILE_MAX_PER_TOPIC
    ? `<a class="meanwhile-more" href="viewer.html?d=${encodeURIComponent(topicId)}#minY=${encodeURIComponent(minY)}&maxY=${encodeURIComponent(maxY)}">See all ${sorted.length} ${esc(meta.itemNoun||"results")} &rarr;</a>`
    : "";
  return `<div class="meanwhile-group">
    <h3 class="meanwhile-heading">${esc(meta.title||topicId)}</h3>
    <div class="meanwhile-items">${itemsHtml}</div>
    ${moreHtml}
  </div>`;
}

// Renders the "Also in" line for entries sharing this one's Wikipedia url in another topic
// (E2-04). Requires the corpus to already be loaded; returns "" when there is no match, per
// the entity link block below.
function alsoInHtml(r){
  const matches=corpusFindByUrl(r.url);
  if(!matches.length)return "";
  const links=matches
    .map(m=>`<a class="detail-link" href="viewer.html?d=${encodeURIComponent(m.topic)}&id=${encodeURIComponent(m.entry.id)}">${esc(m.meta.title||m.topic)} &rarr;</a>`)
    .join("");
  return `<div class="detail-links detail-also-in"><span class="detail-also-in-label">Also in:</span> ${links}</div>`;
}

async function renderMeanwhile(r){
  const extras=$("#detail-meanwhile");
  if(!extras)return;
  const token=++meanwhileToken;
  extras.innerHTML=`<div class="meanwhile-loading">Loading what else was happening&hellip;</div>`;

  let corpus;
  try{
    corpus=await loadCorpus();
  }catch(err){
    console.warn("Meanwhile: could not load corpus.",err);
    if(token===meanwhileToken)extras.innerHTML="";
    return;
  }
  if(token!==meanwhileToken)return; // a later navigation superseded this call

  const alsoIn=alsoInHtml(r);

  if(!Number.isFinite(r.y)){if(token===meanwhileToken)extras.innerHTML=alsoIn;return;}

  const topicId=currentDataset();
  const ownEntries=DATA.filter(e=>e.id!==r.id && Number.isFinite(e.y));
  let radius=MEANWHILE_WINDOWS[0], minY, maxY, own=[], others=[];
  for(const w of MEANWHILE_WINDOWS){
    radius=w; minY=r.y-w; maxY=r.y+w;
    own=ownEntries.filter(e=>e.y>=minY&&e.y<=maxY);
    others=corpusByYear(minY,maxY,{excludeId:r.id});
    if(own.length+others.length>=5)break;
  }
  if(!own.length && !others.length){if(token===meanwhileToken)extras.innerHTML=alsoIn;return;}

  const groups=new Map();
  groups.set(topicId,{meta:CFG,entries:own});
  others.forEach(c=>{
    if(!groups.has(c.topic))groups.set(c.topic,{meta:c.meta,entries:[]});
    groups.get(c.topic).entries.push(c.entry);
  });
  const orderedTopicIds=TOPICS.map(t=>t.id).filter(id=>groups.has(id)&&groups.get(id).entries.length);

  const headingSuffix=radius===MEANWHILE_WINDOWS[0]?"":` (within ${radius} years)`;
  const groupsHtml=orderedTopicIds
    .map(id=>meanwhileGroupHtml(id,groups.get(id).meta,groups.get(id).entries,r,minY,maxY))
    .join("");

  if(token!==meanwhileToken)return;
  extras.innerHTML=`${alsoIn}<div class="meanwhile">
    <h2 class="meanwhile-title">Meanwhile${headingSuffix}</h2>
    ${groupsHtml}
  </div>`;
}
// ---- end meanwhile ----

// ---- quiz ----
// Quiz mode shell (E4-01): routing, round flow, scoring, pool selection and stats. Ships with
// no question types of its own -- E4-02/E4-03 append entries to QUIZ_TYPES; this file only
// owns the frame, and it stays topic-agnostic, driven by CFG same as the rest of the viewer.
// Each type is { id, label, canGenerate(pool,meta), generate(pool,meta) } where generate()
// returns { prompt, choices, answerIndex, explanationEntryId, reveal? } -- reveal is optional
// unredacted text shown alongside the entry link once a question is answered. A type that
// explains more than one entry (e.g. E4-03's chronology) returns explanationEntryIds (plural)
// instead; the shell links whichever is present. Routed via
// ?d=<topic>&mode=quiz, alongside lineage and entity routing above -- never the hash, since
// this state (unlike filters) must survive a fresh tab.
let QUIZ_TYPES=[];

const QUIZ_ROUND_LEN=10;
const QUIZ_MIN_POOL=8;
const QUIZ_STATS_KEY="phil_quiz_v1";
let quizRound=null; // null = show the start screen; otherwise {phase,pool,questions,idx,score,selected,answered}

function quizLoadStats(){
  try{ return JSON.parse(localStorage.getItem(QUIZ_STATS_KEY))||{}; }catch(e){ return {}; }
}
function quizSaveStats(stats){
  try{ localStorage.setItem(QUIZ_STATS_KEY, JSON.stringify(stats)); }catch(e){}
}
function quizTopicStats(stats){
  const topicId=currentDataset();
  if(!stats[topicId])stats[topicId]={answered:0,correct:0,perEntry:{}};
  return stats[topicId];
}
function quizRecordAnswer(entryId,wasCorrect){
  const stats=quizLoadStats();
  const t=quizTopicStats(stats);
  t.answered++;
  if(wasCorrect)t.correct++;
  if(entryId){
    if(!t.perEntry[entryId])t.perEntry[entryId]={correct:0,incorrect:0};
    t.perEntry[entryId][wasCorrect?"correct":"incorrect"]++;
  }
  quizSaveStats(stats);
}
function quizResetStats(){
  const stats=quizLoadStats();
  delete stats[currentDataset()];
  quizSaveStats(stats);
}

function quizAvailableTypes(pool){
  return QUIZ_TYPES.filter(t=>{
    try{ return !!t.canGenerate(pool,CFG); }
    catch(err){ console.warn(`Quiz type "${t.id}" threw in canGenerate().`,err); return false; }
  });
}

function quizGenerateQuestions(pool){
  const types=quizAvailableTypes(pool);
  if(!types.length)return [];
  const questions=[];
  let attempts=0;
  while(questions.length<QUIZ_ROUND_LEN && attempts<QUIZ_ROUND_LEN*5){
    attempts++;
    const type=types[Math.floor(Math.random()*types.length)];
    let q=null;
    try{ q=type.generate(pool,CFG); }
    catch(err){ console.warn(`Quiz type "${type.id}" threw in generate().`,err); }
    if(q && Array.isArray(q.choices) && q.choices.length>1 && Number.isInteger(q.answerIndex))questions.push(q);
  }
  return questions;
}

function quizPoolDescription(pool){
  const noun=(CFG.itemNoun||"entries").toLowerCase();
  const hasFilters=state.q || state.showFavs || state.yMin!=null || FILTERS.some(f=>state.filters[f.id].size);
  return hasFilters
    ? `${pool.length} ${noun} matching your current filters`
    : `${pool.length} ${noun}`;
}

function quizStart(){
  const pool=DATA.filter(match);
  if(pool.length>=QUIZ_MIN_POOL){
    const questions=quizGenerateQuestions(pool);
    if(questions.length)quizRound={phase:"playing",pool,questions,idx:0,score:0,selected:null,answered:false};
  }
  renderQuiz();
}

function quizAnswer(choiceIdx){
  if(!quizRound||quizRound.phase!=="playing"||quizRound.answered)return;
  const q=quizRound.questions[quizRound.idx];
  quizRound.answered=true;
  quizRound.selected=choiceIdx;
  const correct=choiceIdx===q.answerIndex;
  if(correct)quizRound.score++;
  quizRecordAnswer(q.explanationEntryId,correct);
  renderQuiz();
}

function quizAdvance(){
  if(!quizRound||quizRound.phase!=="playing"||!quizRound.answered)return;
  if(quizRound.idx+1>=quizRound.questions.length){
    quizRound.phase="done";
  }else{
    quizRound.idx++;
    quizRound.selected=null;
    quizRound.answered=false;
  }
  renderQuiz();
}

function quizBackLinkHtml(){
  return `<a href="#" class="detail-back" id="quizBack">&larr; All ${esc(CFG.itemNoun||"")}</a>`;
}
function wireQuizBack(box){
  const back=box.querySelector("#quizBack");
  if(back)back.addEventListener("click",e=>{e.preventDefault();navigateToList();});
}

function renderQuizStart(box){
  const pool=DATA.filter(match);
  const stats=quizLoadStats();
  const t=quizTopicStats(stats);
  const poolOk=pool.length>=QUIZ_MIN_POOL;
  const types=quizAvailableTypes(pool);
  let body;
  if(!poolOk){
    body=`<div class="quiz-empty"><p>Not enough ${esc((CFG.itemNoun||"entries").toLowerCase())} match your
      current filters to start a quiz &mdash; need at least ${QUIZ_MIN_POOL}, found ${pool.length}.
      Leave quiz mode, broaden your filters, and try again.</p></div>`;
  }else if(!types.length){
    body=`<div class="quiz-empty"><p>No quiz question types are available yet for this topic.
      Check back once question types are added.</p></div>`;
  }else{
    body=`<button type="button" class="quiz-start-btn" id="quizStartBtn">Start round</button>`;
  }
  const pct=t.answered?Math.round(100*t.correct/t.answered):0;
  const statsHtml=t.answered
    ?`<div class="quiz-stats">
        <span>${t.correct} / ${t.answered} correct all-time (${pct}%)</span>
        <button type="button" class="quiz-reset-btn" id="quizResetStats">Reset stats</button>
      </div>`
    :"";
  box.innerHTML=`
    ${quizBackLinkHtml()}
    <h1 class="quiz-title">Quiz</h1>
    <p class="quiz-pool-desc">${esc(quizPoolDescription(pool))}</p>
    ${body}
    ${statsHtml}
  `;
  wireQuizBack(box);
  const startBtn=box.querySelector("#quizStartBtn");
  if(startBtn)startBtn.addEventListener("click",quizStart);
  const resetBtn=box.querySelector("#quizResetStats");
  if(resetBtn)resetBtn.addEventListener("click",()=>{quizResetStats();renderQuiz();});
}

function renderQuizPlaying(box){
  const q=quizRound.questions[quizRound.idx];
  const total=quizRound.questions.length;
  const answered=quizRound.answered;
  const choicesHtml=q.choices.map((c,i)=>{
    let cls="quiz-choice";
    if(answered){
      if(i===q.answerIndex)cls+=" correct";
      else if(i===quizRound.selected)cls+=" incorrect";
    }
    return `<button type="button" class="${cls}" data-idx="${i}"${answered?" disabled":""}>
      <span class="quiz-choice-num">${i+1}</span><span>${esc(String(c))}</span></button>`;
  }).join("");
  const explainIds=Array.isArray(q.explanationEntryIds)&&q.explanationEntryIds.length
    ? q.explanationEntryIds
    : (q.explanationEntryId?[q.explanationEntryId]:[]);
  const explainEntries=explainIds.map(id=>DATA.find(e=>e.id===id)).filter(Boolean);
  const wasCorrect=quizRound.selected===q.answerIndex;
  const explainLinksHtml=explainEntries.map(en=>
    `<a class="quiz-explain-link" data-entry-id="${esc(en.id)}" href="viewer.html?d=${encodeURIComponent(currentDataset())}&id=${encodeURIComponent(en.id)}">${esc(en.name)} &rarr;</a>`
  ).join(" &middot; ");
  const explainHtml=answered
    ?`<div class="quiz-explain">
        <div class="quiz-result ${wasCorrect?"right":"wrong"}">${wasCorrect?"Correct!":"Not quite."}</div>
        ${q.reveal?`<p class="quiz-reveal-text">${esc(q.reveal)}</p>`:""}
        ${explainLinksHtml?`<p class="quiz-explain-links">${explainLinksHtml}</p>`:""}
        <button type="button" class="quiz-next-btn" id="quizNextBtn">${quizRound.idx+1<total?"Next":"See score"} <span class="quiz-key-hint">Enter</span></button>
      </div>`
    :"";
  box.innerHTML=`
    ${quizBackLinkHtml()}
    <div class="quiz-progress">Question ${quizRound.idx+1} of ${total} &middot; Score ${quizRound.score}</div>
    <h1 class="quiz-prompt">${esc(q.prompt)}</h1>
    <div class="quiz-choices">${choicesHtml}</div>
    ${explainHtml}
  `;
  wireQuizBack(box);
  box.querySelectorAll(".quiz-choice").forEach(btn=>btn.addEventListener("click",()=>quizAnswer(Number(btn.dataset.idx))));
  box.querySelectorAll(".quiz-explain-link").forEach(link=>link.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToEntry(link.dataset.entryId);
  }));
  const nextBtn=box.querySelector("#quizNextBtn");
  if(nextBtn)nextBtn.addEventListener("click",quizAdvance);
}

function renderQuizDone(box){
  const total=quizRound.questions.length;
  box.innerHTML=`
    ${quizBackLinkHtml()}
    <h1 class="quiz-title">Round complete</h1>
    <div class="quiz-score-summary">${quizRound.score} / ${total} correct</div>
    <div class="quiz-actions">
      <button type="button" class="quiz-play-again-btn" id="quizPlayAgain">Play again</button>
      <button type="button" class="quiz-browsing-btn" id="quizToBrowsing">Back to browsing</button>
    </div>
  `;
  wireQuizBack(box);
  box.querySelector("#quizPlayAgain").addEventListener("click",()=>{quizRound=null;quizStart();});
  box.querySelector("#quizToBrowsing").addEventListener("click",()=>navigateToList());
}

function renderQuiz(){
  const box=$("#quiz");
  if(!box)return;
  document.title=`Quiz · ${CFG.title||"Index"}`;
  if(quizRound&&quizRound.phase==="playing"){renderQuizPlaying(box);return;}
  if(quizRound&&quizRound.phase==="done"){renderQuizDone(box);return;}
  renderQuizStart(box);
}

function navigateToQuiz(){
  state.mode="quiz";
  state.entryId=null;
  state.lineageFrom=null;state.lineageTo=null;state.lineageUndirected=false;
  quizRound=null;
  cardsSession=null;
  const url=new URL(location.href);
  url.searchParams.set("mode","quiz");
  url.searchParams.delete("id");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  url.searchParams.delete("undirected");
  url.hash="";
  history.pushState(null,"",url.pathname+url.search);
  render();
}

const quizBtn=$("#quizBtn");
if(quizBtn)quizBtn.addEventListener("click",navigateToQuiz);

document.addEventListener("keydown",e=>{
  if(state.mode!=="quiz"||!quizRound||quizRound.phase!=="playing")return;
  if(isTypingTarget(document.activeElement))return;
  if(!quizRound.answered){
    const n=Number(e.key);
    if(Number.isInteger(n)&&n>=1&&n<=quizRound.questions[quizRound.idx].choices.length){
      e.preventDefault();
      quizAnswer(n-1);
    }
  }else if(e.key==="Enter"){
    e.preventDefault();
    quizAdvance();
  }
});
// ---- quiz: tldr-identify question type (E4-02) ----
// The first real question type: redact the answer's name out of its tldr, ask which of four
// names it describes. Requires tldr coverage; canGenerate is purely data-driven so it opens up
// automatically as topics gain tldr text, rather than hardcoding which topics qualify.
const TLDR_IDENTIFY_MIN_POOL=8;

function tldrIdentifyUsedAnswers(pool){
  // Keyed off the pool array itself: quizStart() builds a fresh pool per round, so this
  // resets naturally without the shell needing to know this type tracks anything.
  if(!pool.__tldrIdentifyUsed)pool.__tldrIdentifyUsed=new Set();
  return pool.__tldrIdentifyUsed;
}

function tldrIdentifyCardTagValues(entry,meta){
  const vals=new Set();
  (meta.cardTags||[]).forEach(ct=>{
    const f=(meta.filters||[]).find(x=>x.id===ct.id);
    if(!f)return;
    const v=entry[f.key];
    if(v==null||v==="")return;
    (Array.isArray(v)?v:[v]).forEach(x=>vals.add(`${f.key}:${x}`));
  });
  return vals;
}

function tldrIdentifyShuffled(arr){
  return arr.slice().sort(()=>Math.random()-0.5);
}

function tldrIdentifyPickDistractors(answer,pool,meta){
  const answerTags=tldrIdentifyCardTagValues(answer,meta);
  const shuffled=tldrIdentifyShuffled(pool.filter(r=>r.id!==answer.id));
  const withSharedTag=[],rest=[];
  shuffled.forEach(r=>{
    let shares=false;
    for(const t of tldrIdentifyCardTagValues(r,meta)){
      if(answerTags.has(t)){shares=true;break;}
    }
    (shares?withSharedTag:rest).push(r);
  });
  return [...withSharedTag,...rest].slice(0,3);
}

function tldrIdentifyRedactionTerms(name){
  const terms=new Set();
  if(name)terms.add(name);
  name.split(/\s+/).forEach(part=>{
    const cleaned=part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu,"");
    if(cleaned.length>3)terms.add(cleaned);
  });
  const commaIdx=name.indexOf(",");
  if(commaIdx>0){
    const before=name.slice(0,commaIdx).trim();
    if(before)terms.add(before);
  }
  return [...terms].sort((a,b)=>b.length-a.length); // longest first so "Abelard, Peter" beats "Abelard"
}

function tldrIdentifyRedact(entry){
  const terms=tldrIdentifyRedactionTerms(entry.name||"");
  let text=entry.tldr||"";
  terms.forEach(term=>{
    if(!term)return;
    const escaped=term.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    // No trailing boundary: inflected/Latinised forms of a name (e.g. "Domitianus" for
    // "Domitian", "Sasanian" for "Sasan") would otherwise leak the answer right after it.
    text=text.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}`,"giu"),"———");
  });
  return text;
}

QUIZ_TYPES.push({
  id:"tldr-identify",
  label:"Identify from tl;dr",
  canGenerate(pool){
    return pool.filter(r=>r.tldr).length>=TLDR_IDENTIFY_MIN_POOL;
  },
  generate(pool,meta){
    const used=tldrIdentifyUsedAnswers(pool);
    const candidates=pool.filter(r=>r.tldr&&!used.has(r.id));
    if(!candidates.length)return null;
    const answer=candidates[Math.floor(Math.random()*candidates.length)];
    const distractors=tldrIdentifyPickDistractors(answer,pool,meta);
    if(distractors.length<3)return null;
    used.add(answer.id);
    const choiceEntries=tldrIdentifyShuffled([answer,...distractors]);
    const noun=(meta.itemNounSingular||"entry").toLowerCase();
    return {
      prompt:`Which ${noun} does this describe? ${tldrIdentifyRedact(answer)}`,
      choices:choiceEntries.map(e=>e.dates?`${e.name} · ${e.dates}`:e.name),
      answerIndex:choiceEntries.indexOf(answer),
      explanationEntryId:answer.id,
      reveal:answer.tldr
    };
  }
});
// ---- end quiz: tldr-identify question type ----

// ---- quiz: chronology question type (E4-03) ----
// Order three pool entries oldest first. Every entry in every topic has `y` (unlike tldr
// coverage, which tldr-identify needs), so this is the only type hist-events can offer.
// Choices are orderings of the three names -- no drag-and-drop, just the shell's existing
// multiple-choice mechanism -- and dates stay hidden until the reveal.
const CHRONOLOGY_MIN_POOL=8;
const CHRONOLOGY_MIN_GAP=15; // years apart, so the correct order is never ambiguous

function chronologyShuffled(arr){
  return arr.slice().sort(()=>Math.random()-0.5);
}

function chronologyPermutations(arr){
  if(arr.length<=1)return [arr];
  const perms=[];
  arr.forEach((item,i)=>{
    const rest=[...arr.slice(0,i),...arr.slice(i+1)];
    chronologyPermutations(rest).forEach(p=>perms.push([item,...p]));
  });
  return perms;
}

function chronologyPickTrio(pool){
  const dated=pool.filter(r=>Number.isFinite(r.y));
  if(dated.length<3)return null;
  const sorted=dated.slice().sort((a,b)=>a.y-b.y);
  const attempts=Math.min(50,sorted.length*3);
  for(let t=0;t<attempts;t++){
    const i=Math.floor(Math.random()*sorted.length);
    let j=-1;
    for(let x=i+1;x<sorted.length;x++){
      if(sorted[x].y-sorted[i].y>=CHRONOLOGY_MIN_GAP){j=x;break;}
    }
    if(j<0)continue;
    let k=-1;
    for(let x=j+1;x<sorted.length;x++){
      if(sorted[x].y-sorted[j].y>=CHRONOLOGY_MIN_GAP){k=x;break;}
    }
    if(k<0)continue;
    return [sorted[i],sorted[j],sorted[k]];
  }
  return null;
}

// Whether `y` reads as a birth year (phil, hist-chars) rather than an event year
// (hist-events): driven by the entries' own `dates` shape -- a birth-death range like
// "1079-1142" -- rather than the topic id, so it stays correct for any future topic shape.
function chronologyLooksLikeLifespan(trio){
  return trio.filter(e=>/–/.test(e.dates||"")).length>=2;
}

QUIZ_TYPES.push({
  id:"chronology",
  label:"Chronological order",
  canGenerate(pool){
    return pool.filter(r=>Number.isFinite(r.y)).length>=CHRONOLOGY_MIN_POOL;
  },
  generate(pool,meta){
    const trio=chronologyPickTrio(pool);
    if(!trio)return null;
    const correctOrder=trio.slice().sort((a,b)=>a.y-b.y);
    const correctKey=correctOrder.map(e=>e.id).join("|");
    const wrongPerms=chronologyShuffled(
      chronologyPermutations(correctOrder).filter(p=>p.map(e=>e.id).join("|")!==correctKey)
    ).slice(0,3);
    if(wrongPerms.length<3)return null;
    const choiceOrders=chronologyShuffled([correctOrder,...wrongPerms]);
    const answerIndex=choiceOrders.findIndex(p=>p.map(e=>e.id).join("|")===correctKey);
    const shownOrder=chronologyShuffled(trio);
    const noun=meta.itemNoun||`${(meta.itemNounSingular||"entry").toLowerCase()}s`;
    const verb=chronologyLooksLikeLifespan(trio)?"in order of birth":"in chronological order";
    return {
      prompt:`Put these three ${noun} ${verb}, earliest first: ${shownOrder.map(e=>e.name).join(", ")}`,
      choices:choiceOrders.map(order=>order.map(e=>e.name).join(" → ")),
      answerIndex,
      explanationEntryIds:correctOrder.map(e=>e.id),
      reveal:correctOrder.map(e=>`${e.name} (${e.dates})`).join(" → ")
    };
  }
});
// ---- end quiz: chronology question type ----

// ---- end quiz ----

// ---- flashcards ----
// Flashcard drill over favourites (E4-04): a Leitner-style spaced-repetition scheduler over
// the current topic's favourites (FAVS, defined above). Routed via ?d=<topic>&mode=cards,
// alongside quiz and lineage routing above -- never the hash, since this state must survive
// a fresh tab like the other top-level modes. Independent of quiz's question types, but
// reuses quiz's per-entry correct/incorrect counts (phil_quiz_v1) to seed a card's starting
// box so quiz performance carries over instead of every favourite starting cold.
const CARDS_KEY="phil_cards_v1";
const CARDS_ROUND_LEN=20;
const CARD_INTERVALS=[1,2,4,8,16]; // days, indexed by box-1 (boxes are 1..5)
// null = no session yet, renderCards() deals a fresh one; otherwise
// {queue,total,doneCount,dueCount,phase} where phase is "front"|"back"|"done" and queue
// holds the remaining entry ids for this session, current card first.
let cardsSession=null;

function cardsLoadStore(){
  try{ return JSON.parse(localStorage.getItem(CARDS_KEY))||{}; }catch(e){ return {}; }
}
function cardsSaveStore(store){
  try{ localStorage.setItem(CARDS_KEY, JSON.stringify(store)); }catch(e){}
}
function cardsTopicStore(store){
  const topicId=currentDataset();
  if(!store[topicId])store[topicId]={};
  return store[topicId];
}
function cardsTodayKey(){
  return new Date().toISOString().slice(0,10);
}
function cardsAddDays(dateKey,days){
  const d=new Date(dateKey+"T00:00:00Z");
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}

function cardsSeedBox(entryId){
  const quizStats=quizLoadStats();
  const t=quizStats[currentDataset()];
  const pe=t&&t.perEntry&&t.perEntry[entryId];
  if(!pe)return 1;
  const net=(pe.correct||0)-(pe.incorrect||0);
  return Math.min(5,Math.max(1,1+net));
}

function cardsDeck(){
  return DATA.filter(r=>FAVS.has(r.name));
}

// Due cards first, then cards never graded in this mode, capped at CARDS_ROUND_LEN. A card
// scheduled for a future date and already seen is left out entirely -- it isn't due yet.
function cardsBuildQueue(deck){
  const topicStore=cardsTopicStore(cardsLoadStore());
  const today=cardsTodayKey();
  const due=[],unseen=[];
  deck.forEach(r=>{
    const rec=topicStore[r.id];
    if(!rec)unseen.push(r.id);
    else if(rec.due<=today)due.push(r.id);
  });
  return {due,queue:[...due,...unseen].slice(0,CARDS_ROUND_LEN)};
}

function cardsGrade(entryId,grade){
  const store=cardsLoadStore();
  const t=cardsTopicStore(store);
  const rec=t[entryId]||{box:cardsSeedBox(entryId),due:cardsTodayKey()};
  let newBox;
  if(grade==="again")newBox=1;
  else if(grade==="good")newBox=Math.min(5,rec.box+1);
  else newBox=Math.min(5,rec.box+2); // easy
  rec.box=newBox;
  rec.due=grade==="again"?cardsTodayKey():cardsAddDays(cardsTodayKey(),CARD_INTERVALS[newBox-1]);
  t[entryId]=rec;
  cardsSaveStore(store);
}

function cardsCurrentEntry(){
  if(!cardsSession||!cardsSession.queue.length)return null;
  return DATA.find(r=>r.id===cardsSession.queue[0])||null;
}

function cardsFlip(){
  if(!cardsSession||cardsSession.phase!=="front")return;
  cardsSession.phase="back";
  renderCards();
}

function cardsAnswer(grade){
  if(!cardsSession||cardsSession.phase!=="back")return;
  const entryId=cardsSession.queue.shift();
  cardsGrade(entryId,grade);
  if(grade==="again"){
    // Reschedule within this session rather than waiting for the persisted due date.
    const reinsertAt=Math.min(3,cardsSession.queue.length);
    cardsSession.queue.splice(reinsertAt,0,entryId);
  }else{
    cardsSession.doneCount++;
  }
  cardsSession.phase=cardsSession.queue.length?"front":"done";
  renderCards();
}

function cardsBackLinkHtml(){
  return `<a href="#" class="detail-back" id="cardsBack">&larr; All ${esc(CFG.itemNoun||"")}</a>`;
}
function wireCardsBack(box){
  const back=box.querySelector("#cardsBack");
  if(back)back.addEventListener("click",e=>{e.preventDefault();navigateToList();});
}

function renderCardsEmpty(box){
  const deck=cardsDeck();
  const noun=(CFG.itemNoun||"entries").toLowerCase();
  const body=deck.length
    ?`<p>Nothing is due right now, and there are no new cards left for this session.
        Come back later, or star more ${esc(noun)}.</p>`
    :`<p>No favourites yet. Star a few ${esc(noun)} with the &#9733; button on any card,
        then come back here to study them.</p>`;
  box.innerHTML=`
    ${cardsBackLinkHtml()}
    <h1 class="quiz-title">Study favourites</h1>
    <div class="quiz-empty">${body}</div>
  `;
  wireCardsBack(box);
}

function renderCardsPlaying(box){
  const r=cardsCurrentEntry();
  if(!r){cardsSession=null;renderCardsEmpty(box);return;}
  const flipped=cardsSession.phase==="back";
  const backHtml=flipped?`
    ${r.desc?`<p class="cards-desc">${esc(r.desc)}</p>`:""}
    ${r.tldr?`<p class="cards-tldr">${esc(r.tldr)}</p>`:""}
    <a class="cards-detail-link" id="cardsDetailLink" data-id="${esc(r.id)}"
       href="viewer.html?d=${encodeURIComponent(currentDataset())}&id=${encodeURIComponent(r.id)}">Open detail view &rarr;</a>
    <div class="cards-grades">
      <button type="button" class="cards-grade-btn again" data-grade="again">Again <span class="quiz-key-hint">1</span></button>
      <button type="button" class="cards-grade-btn good" data-grade="good">Good <span class="quiz-key-hint">2</span></button>
      <button type="button" class="cards-grade-btn easy" data-grade="easy">Easy <span class="quiz-key-hint">3</span></button>
    </div>
  `:`<button type="button" class="cards-flip-btn" id="cardsFlipBtn">Flip <span class="quiz-key-hint">Space</span></button>`;
  box.innerHTML=`
    ${cardsBackLinkHtml()}
    <div class="quiz-progress">Card ${Math.min(cardsSession.doneCount+1,cardsSession.total)} of ${cardsSession.total}
      &middot; ${cardsSession.dueCount} due today</div>
    <div class="cards-card${flipped?" flipped":""}">
      <h1 class="cards-name">${esc(r.name)}</h1>
      <div class="cards-dates">${esc(r.dates||"")}</div>
      ${backHtml}
    </div>
  `;
  wireCardsBack(box);
  const flipBtn=box.querySelector("#cardsFlipBtn");
  if(flipBtn)flipBtn.addEventListener("click",cardsFlip);
  box.querySelectorAll(".cards-grade-btn").forEach(btn=>btn.addEventListener("click",()=>cardsAnswer(btn.dataset.grade)));
  const detailLink=box.querySelector("#cardsDetailLink");
  if(detailLink)detailLink.addEventListener("click",e=>{
    if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();
    navigateToEntry(detailLink.dataset.id);
  });
}

function renderCardsDone(box){
  box.innerHTML=`
    ${cardsBackLinkHtml()}
    <h1 class="quiz-title">Session complete</h1>
    <div class="quiz-score-summary">${cardsSession.doneCount} of ${cardsSession.total} cards reviewed</div>
    <div class="quiz-actions">
      <button type="button" class="quiz-play-again-btn" id="cardsPlayAgain">Study more</button>
      <button type="button" class="quiz-browsing-btn" id="cardsToBrowsing">Back to browsing</button>
    </div>
  `;
  wireCardsBack(box);
  box.querySelector("#cardsPlayAgain").addEventListener("click",()=>{cardsSession=null;renderCards();});
  box.querySelector("#cardsToBrowsing").addEventListener("click",()=>navigateToList());
}

function renderCards(){
  const box=$("#cards");
  if(!box)return;
  document.title=`Study favourites · ${CFG.title||"Index"}`;
  if(!cardsSession){
    const deck=cardsDeck();
    const {due,queue}=cardsBuildQueue(deck);
    if(queue.length)cardsSession={queue,total:queue.length,doneCount:0,dueCount:due.length,phase:"front"};
  }
  if(cardsSession&&cardsSession.phase==="done"){renderCardsDone(box);return;}
  if(cardsSession&&cardsSession.queue.length){renderCardsPlaying(box);return;}
  renderCardsEmpty(box);
}

function navigateToCards(){
  state.mode="cards";
  state.entryId=null;
  state.lineageFrom=null;state.lineageTo=null;state.lineageUndirected=false;
  quizRound=null;
  cardsSession=null;
  const url=new URL(location.href);
  url.searchParams.set("mode","cards");
  url.searchParams.delete("id");
  url.searchParams.delete("from");
  url.searchParams.delete("to");
  url.searchParams.delete("undirected");
  url.hash="";
  history.pushState(null,"",url.pathname+url.search);
  render();
}

const studyCardsBtn=$("#studyCardsBtn");
if(studyCardsBtn)studyCardsBtn.addEventListener("click",navigateToCards);

document.addEventListener("keydown",e=>{
  if(state.mode!=="cards"||!cardsSession||cardsSession.phase==="done")return;
  if(isTypingTarget(document.activeElement))return;
  if(cardsSession.phase==="front"){
    if(e.code==="Space"){e.preventDefault();cardsFlip();}
  }else if(cardsSession.phase==="back"){
    if(e.key==="1"){e.preventDefault();cardsAnswer("again");}
    else if(e.key==="2"){e.preventDefault();cardsAnswer("good");}
    else if(e.key==="3"){e.preventDefault();cardsAnswer("easy");}
  }
});
// ---- end flashcards ----

async function initApp(){
  await loadTopics();
  try{
    await loadData();
    buildUI();
    const kicker=document.querySelector(".kicker");
    if(kicker)kicker.textContent=(CFG.kicker||"").replace("{n}",DATA.length);
    readEntryIdFromUrl();
    readModeFromUrl();
    await decodeHash();
    if(!location.hash)render();
  }catch(err){
    console.error(err);
    $("#results").innerHTML=`<div class="empty"><h3>Could not load data.</h3>
      <p>Serve this folder over HTTP so the browser can fetch the JSON files.</p></div>`;
  }
}
initApp();

