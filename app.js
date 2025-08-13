
/***** CONFIG *****/
const SOURCE_URL = 'n5-word.txt';
const DEFAULT_LEVEL = 'N5';
const TEST_SIZE = 5;
const TEST_LIVES = 3;

/***** STATE *****/
let rawCards = [], cards = [];
let session = { mode: 'learn', limit: 20, list: [], i: 0, correct: 0, total: 0 };
let frontKey = 'kanji', backKey = 'meaning', useThai = true, speakJP = false, autoNext = true;
let answerKey = 'meaning', fuzzy = true;
let filters = getStore('filters', { level: DEFAULT_LEVEL, search: '', cats: [] });

let mastery = getStore('mastery', {}), leitner = getStore('leitner', {}), thMap = getStore('thaiMap', {}),
    stats = getStore('statsByCat', {}), stars = getStore('starsByCat', {});
let showingBack = false;

let testState = null;   // {lives, usedHint, idx, set, perfect}
let typeState = null;   // {lives, usedHint, idx, set}

/***** UTILS *****/
const $  = (s, el=document)=> el.querySelector(s);
const $$ = (s, el=document)=> Array.from(el.querySelectorAll(s));
function getStore(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } }
function setStore(k, v){ localStorage.setItem(k, JSON.stringify(v)) }
const esc = s => (s??'').toString()
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'","&#39;");
function hashId(o){
  const s=[o.kanji,o.kana,o.romaji,o.meaning,o.level,o.category].map(x=>x||'').join('|');
  let h=0; for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0 }
  return String(h);
}
function shuffle(a){ const r=[...a]; for(let i=r.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0; [r[i],r[j]]=[r[j],r[i]] } return r }
function normalizeAnswer(x){ if(!x) return ''; let s=x.toString().trim(); if(fuzzy){ s=s.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim(); } return s }

/***** LAYOUT UTILS *****/
function setHasControls(enable){
  const st = document.querySelector('.stage');
  if (st) st.classList.toggle('has-controls', !!enable);
}

/***** DATA LOADERS *****/
async function loadFromURL(){
  try{
    const res=await fetch(SOURCE_URL);
    const ct=res.headers.get('content-type')||''; const text=await res.text();
    if(ct.includes('application/json')||text.trim().startsWith('{')||text.trim().startsWith('[')){
      const json=JSON.parse(text);
      return (json.vocab??json).map(x=>norm({kanji:x.kanji,kana:x.kana,romaji:x.romaji,meaning:(x.thai??x.meaning??''),jlpt:(x.jlpt??DEFAULT_LEVEL),category:(x.category??'ทั่วไป')}))
    }else{
      return parseCSV(text).map(row=>norm({kanji:row.kanji,kana:row.kana,romaji:row.romaji,meaning:row.meaning,jlpt:(row.jlpt||DEFAULT_LEVEL),category:(row.category||'ทั่วไป')}))
    }
  }catch{
    // fallback เมื่อเปิดแบบ file://
    return [
      {kanji:'行く', kana:'いく', romaji:'iku',   meaning:'ไป',   level:'N5', category:'กริยา'},
      {kanji:'見る', kana:'みる', romaji:'miru',  meaning:'ดู',   level:'N5', category:'กริยา'},
      {kanji:'水',  kana:'みず', romaji:'mizu',  meaning:'น้ำ',  level:'N5', category:'สิ่งของ'},
      {kanji:'大きい', kana:'おおきい', romaji:'ookii', meaning:'ใหญ่', level:'N5', category:'คำคุณศัพท์'},
      {kanji:'学校', kana:'がっこう', romaji:'gakkou', meaning:'โรงเรียน', level:'N5', category:'สถานที่'},
    ];
  }
}
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim().length>0);
  const rows=[]; let header=null;
  const grab=(line)=>{const re=/("([^"]*)"|[^",]+)(?=\s*,|\s*$)/g;const out=[];let m;while((m=re.exec(line))!==null){out.push(m[2]!==undefined?m[2]:m[0])}return out.map(v=>v.trim())}
  for(const ln of lines){
    if(/^kanji\s*,\s*kana\s*,\s*romaji/i.test(ln)){ header=grab(ln).map(h=>h.toLowerCase()); continue; }
    if(!header) continue;
    const arr=grab(ln); if(arr.length<3) continue;
    const obj={}; header.forEach((h,i)=>obj[h]=arr[i]??''); rows.push(obj);
  } return rows;
}
function norm(o){
  const kanji=(o.kanji||'').trim(), kana=(o.kana||'').trim(), romaji=(o.romaji||'').trim(),
        meaning=(o.meaning||'').trim(), jlpt=(o.jlpt||DEFAULT_LEVEL).trim(), category=(o.category||'ทั่วไป').trim();
  return {kanji:kanji||kana||meaning, kana, romaji, meaning, level:jlpt, category, id:hashId(o)};
}
function applyRaw(arr){
  rawCards = arr.map(o=>({ ...o, id:o.id??hashId(o), meaningTh:(thMap[o.id]||'') }));
  buildCategoryDropdown(); restartSession();
}

/***** FILTERS *****/
function buildCategoryDropdown(){
  const sel=$('#selCats'); if(!sel) return;
  sel.innerHTML='';
  const cats=[...new Set(rawCards.map(c=>c.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'th'));
  cats.forEach(c=>{
    const opt=document.createElement('option'); opt.value=c; opt.textContent=c;
    if((filters.cats||[]).includes(c)) opt.selected=true;
    sel.appendChild(opt);
  });
}
function applyFilters(){
  const t=(filters.search||'').toLowerCase();
  let out=rawCards.filter(c=>{
    if(filters.level && c.level!==filters.level) return false;
    if(filters.cats && filters.cats.length && !filters.cats.includes(c.category)) return false;
    if(t){ const hay=[c.kanji,c.kana,c.romaji,c.meaning,(c.meaningTh||'')].join(' ').toLowerCase(); if(!hay.includes(t)) return false; }
    return true;
  });
  return out;
}

/***** SESSION *****/
function restartSession(){
  const limSel = $('#selLimit');
  session.limit= limSel ? (+limSel.value||20) : 20;
  session.mode=$('.mode.active')?.dataset.mode||'learn';
  cards=applyFilters(); session.list=cards.slice(0,session.limit);
  session.i=0; session.correct=0; session.total=0; showingBack=false;
  testState=null; typeState=null;
  render(); updateMini();
  const dock=$('#dock'); if(dock) dock.style.display = (session.mode==='learn') ? 'grid' : 'none';
  const hud=$('#hud'); if(hud) hud.classList.add('hidden');
  hideHintBar();
}
function current(){ return session.list[session.i]; }

/***** ANIMS *****/
function slideThen(kind, done){
  const card=$('#card'); if(!card){ done&&done(); return; }
  const cls = kind==='right' ? 'slide-right' : kind==='left' ? 'slide-left' : 'slide-skip';
  card.classList.remove('slide-right','slide-left','slide-skip'); void card.offsetWidth;
  card.classList.add(cls);
  const onEnd=()=>{ card.classList.remove(cls); card.removeEventListener('animationend', onEnd); done&&done(); };
  card.addEventListener('animationend', onEnd);
}

/***** PRACTICE *****/
function next(kind=0){ if(!session.list.length) return; if(kind){ slideThen(kind,()=>moveNext()) } else moveNext();
  function moveNext(){ session.i=(session.i+1)%session.list.length; showingBack=false; render(); updateMini(); resetButtons(); } }
function prev(){ if(!session.list.length) return; session.i=(session.i-1+session.list.length)%session.list.length; showingBack=false; render(); updateMini(); resetButtons(); }
function mark(know){
  const it=current(); if(!it) return;
  const rec=mastery[it.id]||{know:0,dont:0};
  if(know){ rec.know++; leitner[it.id]=Math.min(5,(leitner[it.id]||1)+1); session.correct++; pressXL($('#btnKnow')); showFX('check'); next('right'); }
  else   { rec.dont++; leitner[it.id]=1;                         pressXL($('#btnDont')); showFX('cross'); next('left'); }
  mastery[it.id]=rec; setStore('mastery',mastery); setStore('leitner',leitner);
  session.total++; bumpStats(it.category,know); updateMini();
}
function doSkip(){ const it=current(); if(!it) return; pressXL($('#btnSkip')); showFX('skip'); session.total++; bumpStats(it.category,false); updateMini(); next('skip'); }
function pressXL(btn){
  const all=[$('#btnDont'),$('#btnSkip'),$('#btnKnow')].filter(Boolean);
  all.forEach(b=>{ if(b!==btn) b.classList.add('shrinkXL'); });
  if(btn) btn.classList.add('pressXL');
  setTimeout(resetButtons, 320);
}
function resetButtons(){ [$('#btnDont'),$('#btnSkip'),$('#btnKnow')].filter(Boolean).forEach(b=> b.classList.remove('pressXL','shrinkXL')) }

/***** RENDER (switch modes) *****/
function setFrontBack(it){
  let fm='',fs1='',fs2='';
  if(frontKey==='kanji'){ fm=it.kanji; fs1=it.kana; fs2=it.romaji; }
  else if(frontKey==='kana'){ fm=it.kana||it.kanji; fs1=it.kanji; fs2=it.romaji; }
  else{ const m=useThai?(it.meaningTh||it.meaning):it.meaning; fm=m; fs1=it.kana||it.kanji; fs2=it.romaji; }
  $('#frontMain') && ($('#frontMain').textContent=fm||'—');
  $('#frontSub1') && ($('#frontSub1').textContent=fs1||'');
  $('#frontSub2') && ($('#frontSub2').textContent=fs2||'');
  const th=useThai?(it.meaningTh||it.meaning):it.meaning;
  $('#backMain') && ($('#backMain').textContent=th||'—');
  $('#backRead') && ($('#backRead').textContent=[it.kana||'',it.romaji||''].filter(Boolean).join(' • '));
}
function render(){
  const mode=session.mode, card=$('#card');

  // กันพื้นที่ล่างเมื่อมีคอนโทรล
  setHasControls(mode==='test' || mode==='type');

  if(mode==='test'){
    startTestIfNeeded(); drawHUD(); renderTestQuestion();
    $('#dock') && ($('#dock').style.display='none'); $('#typePane') && $('#typePane').classList.add('hidden');
    return;
  }
  if(mode==='type'){
    startTypeIfNeeded(); drawHUD(); renderTypeQuestion();
    $('#dock') && ($('#dock').style.display='none'); $('#mcq') && $('#mcq').classList.add('hidden');
    return;
  }
  // Practice
  const it=current();
  $('#badgeLevel') && ($('#badgeLevel').textContent=it?.level||'N5');
  $('#badgeCat') && ($('#badgeCat').textContent=it?.category||'—');
  if(!it){
    $('#frontMain') && ($('#frontMain').textContent='ไม่มีคำตามเงื่อนไข');
    $('#frontSub1') && ($('#frontSub1').textContent='');
    $('#frontSub2') && ($('#frontSub2').textContent='');
    return;
  }
  setFrontBack(it);
  if(card) card.classList.toggle('flipped', showingBack);
  $('#hud') && $('#hud').classList.add('hidden');
  hideHintBar();
  $('#mcq') && $('#mcq').classList.add('hidden');
  $('#typePane') && $('#typePane').classList.add('hidden');
  $('#dock') && ($('#dock').style.display='grid');
  setHasControls(false);
}

/***** HUD / RESET buttons *****/
function drawHUD(){
  const hud=$('#hud'); const use=(session.mode==='test')?testState:typeState;
  if(!use){ hud && hud.classList.add('hidden'); return }
  hud.classList.remove('hidden');
  $('#hudLives') && ($('#hudLives').innerHTML = Array.from({length:TEST_LIVES},(_,i)=>`<span class="heart" style="opacity:${i<use.lives?1:.3}">♥</span>`).join(''));
  $('#hudRound') && ($('#hudRound').textContent = `${use.idx+1}/${TEST_SIZE}`);
  $('#btnResetTest') && ($('#btnResetTest').style.display = (session.mode==='test') ? 'inline-flex' : 'none');
  $('#btnResetType') && ($('#btnResetType').style.display = (session.mode==='type') ? 'inline-flex' : 'none');
}

/***** TEST (MCQ) *****/
function startTestIfNeeded(){
  if(testState) return;
  if(!cards.length){ alert('ไม่มีคำตามเงื่อนไข — ลองเลือกหมวด/ค้นหาใหม่'); session.mode='learn'; render(); return; }
  const pool=shuffle(cards).slice(0,Math.min(TEST_SIZE,cards.length));
  testState={ lives:TEST_LIVES, usedHint:false, idx:0, set:pool, perfect:true };
}
function getTestCurrent(){ return testState?.set[testState.idx]; }
function renderTestQuestion(){
  setHasControls(true);
  const q=getTestCurrent(); if(!q) return;
  $('#badgeLevel') && ($('#badgeLevel').textContent=q.level||'N5');
  $('#badgeCat') && ($('#badgeCat').textContent=q.category||'—');
  setFrontBack(q); $('#card') && $('#card').classList.remove('flipped'); hideHintBar();

  let pool=cards.filter(c=>c.id!==q.id);
  if(pool.length<3) pool=applyFilters().filter(c=>c.id!==q.id);
  const choices=shuffle([q,...shuffle(pool).slice(0,3)]);

  $('#mcq') && $('#mcq').classList.remove('hidden'); $('#typePane') && $('#typePane').classList.add('hidden');
  $('#mcqPrompt') && ($('#mcqPrompt').innerHTML=`ความหมายของ <b>${esc(q.kanji||q.kana)}</b> คือข้อใด?`);
  const host=$('#mcqChoices'); if(!host) return; host.innerHTML='';
  const lang=useThai?(x=>x.meaningTh||x.meaning):(x=>x.meaning);

  choices.forEach(ch=>{
    const btn=document.createElement('button'); btn.className='choice'; btn.textContent=lang(ch)||ch.meaning;
    btn.addEventListener('click',()=>{
      const ok=(ch.id===q.id);
      if(ok){
        btn.classList.add('correct');
        setTimeout(()=>advanceTest(true,q),260);
      }else{
        testState.lives--; testState.perfect=false; drawHUD();
        btn.classList.add('wrong'); setTimeout(()=>btn.remove(),120); // เอาตัวเลือกผิดออก
        showHintBar(()=>{
          testState.usedHint=true;
          $('#hintBar').innerHTML+=`<div class="muted" style="margin-top:6px">romaji: <b>${esc(q.romaji||'-')}</b></div>`;
        }, testState.usedHint);
        if(testState.lives<=0) setTimeout(()=>advanceTest(false,q),200);
      }
    });
    host.appendChild(btn);
  });
}
function showHintBar(onUse, used){
  const bar=$('#hintBar'); if(!bar) return;
  setHasControls(true);
  if(used){
    bar.classList.remove('hidden');
    bar.classList.add('show');
    return;
  }
  bar.innerHTML = `ต้องการ Hint ไหม? <button id="useHint" class="chip primary">ขอ Hint</button>`;
  bar.classList.remove('hidden');
  bar.classList.add('show');
  $('#useHint') && ($('#useHint').onclick=()=>{ onUse&&onUse(); });
}
function hideHintBar(){
  const bar=$('#hintBar'); if(!bar) return;
  bar.classList.remove('show');
  setTimeout(()=> bar.classList.add('hidden'), 200);
}
function advanceTest(ok, q){
  session.total++; if(ok) session.correct++; bumpStats(q.category,ok); updateMini();
  if(testState.lives<=0){ endTest(false); return; }
  if(ok){
    testState.idx++;
    if(testState.idx>=Math.min(TEST_SIZE,testState.set.length)){ endTest(true); return; }
    renderTestQuestion(); drawHUD();
  }
}
function endTest(success){
  if(success && testState.perfect){
    const cat=testState.set[0]?.category||'(ไม่ระบุ)';
    stars[cat]=(stars[cat]||0)+1; setStore('starsByCat',stars);
    showFX('check'); alert(`สุดยอด! ผ่าน ${TEST_SIZE} ข้อแบบไม่พลาด ⭐`);
  }else if(success){
    showFX('skip'); alert(`ผ่านครบ ${TEST_SIZE} ข้อ! เหลือหัวใจ ${testState.lives}`);
  }else{
    showFX('cross'); alert('หัวใจหมดแล้ว ไว้มาลองใหม่');
  }
  testState=null; $('#hud') && $('#hud').classList.add('hidden'); hideHintBar();
  startTestIfNeeded(); render();
}

/***** TYPE (พิมพ์ตอบ) *****/
function startTypeIfNeeded(){
  if(typeState) return;
  if(!cards.length){ alert('ไม่มีคำตามเงื่อนไข — ลองเลือกหมวด/ค้นหาใหม่'); session.mode='learn'; render(); return; }
  const pool=shuffle(cards).slice(0,Math.min(TEST_SIZE,cards.length));
  typeState={ lives:TEST_LIVES, usedHint:false, idx:0, set:pool };
}
function getTypeCurrent(){ return typeState?.set[typeState.idx]; }
function renderTypeQuestion(){
  setHasControls(true);
  const q=getTypeCurrent(); if(!q) return;

  setFrontBack(q);
  // ซ่อนคำอ่านตอนถาม
  $('#frontSub1') && ($('#frontSub1').textContent='');
  $('#frontSub2') && ($('#frontSub2').textContent='');

  $('#card') && $('#card').classList.remove('flipped'); hideHintBar();
  $('#typePane') && $('#typePane').classList.remove('hidden'); $('#mcq') && $('#mcq').classList.add('hidden');

  $('#typePrompt') && ($('#typePrompt').textContent='พิมพ์คำตอบ');
  $('#typeInput') && ($('#typeInput').value='');
  $('#typeFeedback') && ($('#typeFeedback').textContent='');
  setTimeout(()=>$('#typeInput') && $('#typeInput').focus({preventScroll:true}),30);
}
function checkType(forceSubmit=false){
  const st=typeState; const q=getTypeCurrent(); if(!q) return;
  if(!forceSubmit) return; // ต้องกดปุ่มหรือ Enter เท่านั้น

  const inputEl = $('#typeInput');
  const input=normalizeAnswer(inputEl ? inputEl.value : '');
  let target=''; if(answerKey==='kana') target=normalizeAnswer(q.kana||q.kanji);
  else if(answerKey==='romaji') target=normalizeAnswer(q.romaji);
  else target=normalizeAnswer(useThai?(q.meaningTh||q.meaning):q.meaning);

  const ok=input && target && input===target;

  if(ok){
    $('#typeFeedback') && ($('#typeFeedback').textContent='ถูกต้อง!'); showFX('check');
    session.total++; session.correct++; bumpStats(q.category,true); updateMini();
    slideThen('right',()=>{
      st.idx++;
      if(st.idx>=Math.min(TEST_SIZE,st.set.length)){
        alert('จบชุด Type!'); typeState=null; $('#hud') && $('#hud').classList.add('hidden'); hideHintBar(); startTypeIfNeeded(); render(); return;
      }
      renderTypeQuestion(); drawHUD();
    });
  }else{
    st.lives--; drawHUD(); showFX('cross');
    $('#typeFeedback') && ($('#typeFeedback').textContent='ยังไม่ถูก ลองใหม่ได้');
    if(st.lives<=0){ alert('หัวใจหมดแล้ว ไว้มาลองใหม่'); typeState=null; $('#hud') && $('#hud').classList.add('hidden'); startTypeIfNeeded(); render(); return; }
    if(!st.usedHint){
      showHintBar(()=>{
        st.usedHint=true;
        const hint=(answerKey==='meaning')?(q.kana||q.romaji||'-'):(useThai?(q.meaningTh||q.meaning):q.meaning);
        $('#hintBar').innerHTML+=`<div class="muted" style="margin-top:6px">ใบ้: <b>${esc(hint)}</b></div>`;
      }, st.usedHint);
    }
  }
}

/***** COMMON *****/
function bumpStats(cat, ok){ if(!cat) cat='(ไม่ระบุ)'; const s=stats[cat]||{attempts:0,correct:0}; s.attempts++; if(ok) s.correct++; stats[cat]=s; setStore('statsByCat',stats) }
function renderStats(){
  const wrap=$('#statsWrap');
  if(!wrap) return;
  const cats=[...new Set([...Object.keys(stats),...Object.keys(stars)])].sort((a,b)=>a.localeCompare(b,'th'));
  if(!cats.length){ wrap.innerHTML='<div class="muted">ยังไม่มีข้อมูล</div>'; return }
  let html='<table class="stats-table"><thead><tr><th>หมวด</th><th>ทำข้อ</th><th>ถูก</th><th>%</th><th>⭐</th></tr></thead><tbody>';
  for(const c of cats){
    const s=stats[c]||{attempts:0,correct:0};
    const pct=s.attempts?Math.round(100*s.correct/s.attempts):0;
    const st=stars[c]||0;
    html+=`<tr><td>${esc(c)}</td><td>${s.attempts}</td><td>${s.correct}</td><td>${pct}%</td><td>${st}</td></tr>`;
  }
  html+='</tbody></table>'; wrap.innerHTML=html;
}
function resetStats(){ stats={}; stars={}; setStore('statsByCat',stats); setStore('starsByCat',stars); renderStats(); }

function speakKana(text){ if(!speakJP||!text) return; try{ const ut=new SpeechSynthesisUtterance(text); ut.lang='ja-JP'; ut.rate=0.95; speechSynthesis.speak(ut); }catch{} }
function updateMini(){ $('#miniIndex') && ($('#miniIndex').textContent=`${(session.i+1)||0} / ${session.list.length||0}`); const pct=session.total?Math.round(100*session.correct/Math.max(1,session.total)):0; $('#miniPct') && ($('#miniPct').textContent=`${pct}%`) }
function showFX(kind){
  const wrap=$('#fx'), icon=$('#fxIcon'); if(!wrap||!icon) return;
  icon.className='fx-icon'; icon.textContent='';
  if(kind==='check'){ icon.classList.add('fx-check'); icon.textContent='✓'; }
  else if(kind==='cross'){ icon.classList.add('fx-cross'); icon.textContent='✕'; }
  else { icon.classList.add('fx-skip'); icon.textContent='↷'; }
  wrap.classList.remove('hidden');
  icon.style.animation='none'; void icon.offsetWidth; icon.style.animation='';
  setTimeout(()=>wrap.classList.add('hidden'), 520);
}

/***** INIT + UI BINDINGS *****/
document.addEventListener('DOMContentLoaded', async ()=>{
  // ปิด overlay เสมอ (กันแคชคลาสในบางเบราว์เซอร์)
  $('#drawerOverlay')?.classList.remove('open');

  // โหลด prefs
  const selFront=$('#selFront'), selBack=$('#selBack');
  frontKey=getStore('frontKey','kanji');  if(selFront) selFront.value=frontKey;
  backKey=getStore('backKey','meaning');  if(selBack) selBack.value=backKey;
  useThai=getStore('useThai',true);       $('#toggleThai') && ($('#toggleThai').checked=useThai);
  speakJP=getStore('speakJP',false);      $('#toggleSpeak') && ($('#toggleSpeak').checked=speakJP);
  autoNext=getStore('autoNext',true);     $('#toggleAuto') && ($('#toggleAuto').checked=autoNext);
  answerKey=getStore('answerKey','meaning');
  $('#selLevel') && ($('#selLevel').value=filters.level||DEFAULT_LEVEL);

  renderStats();
  bindUI();

  // โหลดคำศัพท์ (มี fallback เสมอ)
  const arr=await loadFromURL(); applyRaw(arr);
});

function bindUI(){
  // Tabs
  $$('.mode').forEach(btn=>btn.addEventListener('click',()=>{
    $$('.mode').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); session.mode=btn.dataset.mode; showingBack=false; render();
  }));

  // Flip ที่การ์ด (เฉพาะ Practice)
  const card=$('#card');
  if(card) card.addEventListener('click', ()=>{ if(session.mode!=='learn') return; showingBack=!showingBack; card.classList.toggle('flipped', showingBack); if(showingBack&&speakJP){ const it=current(); speakKana(it?.kana||''); } });

  // Practice buttons
  $('#btnKnow') && $('#btnKnow').addEventListener('click', ()=>mark(true));
  $('#btnDont') && $('#btnDont').addEventListener('click', ()=>mark(false));
  $('#btnSkip') && $('#btnSkip').addEventListener('click', doSkip);

  // Keyboard
  document.addEventListener('keydown', (e)=>{
    if(e.key==='ArrowRight') next();
    else if(e.key==='ArrowLeft') prev();
    else if(e.key===' ' && session.mode==='learn'){ e.preventDefault(); card && card.click(); }
    else if(e.key==='Enter' && session.mode==='type') checkType(true);
  });

  /* Drawer overlay */
  const overlay=$('#drawerOverlay');
  const openDrawer=()=>{ overlay && (overlay.classList.add('open'), overlay.setAttribute('aria-hidden','false'), document.documentElement.style.overflow='hidden'); };
  const closeDrawer=()=>{ overlay && (overlay.classList.remove('open'), overlay.setAttribute('aria-hidden','true'), document.documentElement.style.overflow=''); };
  $('#btnMenu') && $('#btnMenu').addEventListener('click', openDrawer);
  $('#btnCloseDrawer') && $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  overlay && overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeDrawer(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && overlay && overlay.classList.contains('open')) closeDrawer(); });

  // Apply/Clear
  $('#btnApply') && $('#btnApply').addEventListener('click', ()=>{
    filters.level=$('#selLevel') ? $('#selLevel').value : DEFAULT_LEVEL;
    filters.search=$('#txtSearch') ? $('#txtSearch').value.trim() : '';
    const selCats = $('#selCats');
    filters.cats = selCats ? [...selCats.selectedOptions].map(o=>o.value) : [];
    setStore('filters',filters);
    closeDrawer && closeDrawer();
    restartSession();
  });
  $('#btnClear') && $('#btnClear').addEventListener('click', ()=>{
    filters={level:DEFAULT_LEVEL, search:'', cats:[]}; setStore('filters',filters);
    $('#selLevel') && ($('#selLevel').value=DEFAULT_LEVEL); $('#txtSearch') && ($('#txtSearch').value=''); buildCategoryDropdown();
  });

  // Prefs
  $('#selLimit') && $('#selLimit').addEventListener('change', ()=>restartSession());
  $('#selFront') && $('#selFront').addEventListener('change', e=>{ frontKey=e.target.value; setStore('frontKey',frontKey); render(); });
  $('#selBack') && $('#selBack').addEventListener('change',  e=>{ backKey=e.target.value;  setStore('backKey',backKey);  render(); });
  $('#toggleThai') && $('#toggleThai').addEventListener('change', e=>{ useThai=e.target.checked; setStore('useThai',useThai); render(); });
  $('#toggleSpeak') && $('#toggleSpeak').addEventListener('change', e=>{ speakJP=e.target.checked; setStore('speakJP',speakJP); });
  $('#toggleAuto') && $('#toggleAuto').addEventListener('change',  e=>{ autoNext=e.target.checked; setStore('autoNext',autoNext); });

  // TYPE chooser + submit
  const chooser=$('#typeChooser');
  chooser && chooser.addEventListener('click', (e)=>{
    const b=e.target.closest('.seg'); if(!b) return;
    chooser.querySelectorAll('.seg').forEach(x=>x.classList.remove('active'));
    b.classList.add('active'); answerKey=b.dataset.ans; setStore('answerKey',answerKey);
  });
  $('#btnTypeSubmit') && $('#btnTypeSubmit').addEventListener('click', ()=>checkType(true));

  // Files
  $('#btnLoadURL') && $('#btnLoadURL').addEventListener('click', async ()=>{
    try{ const arr=await loadFromURL(); applyRaw(arr); alert('โหลดคำศัพท์จาก n5-word.txt สำเร็จ'); }
    catch{ alert('ไม่พบไฟล์ n5-word.txt'); }
  });
  $('#btnPickFile') && $('#btnPickFile').addEventListener('click', ()=>$('#filePicker') && $('#filePicker').click());
  $('#filePicker') && $('#filePicker').addEventListener('change', async (e)=>{
    const f=e.target.files?.[0]; if(!f) return; const text=await f.text(); let arr=[];
    try{
      if(f.name.endsWith('.json')||text.trim().startsWith('{')||text.trim().startsWith('[')){
        const json=JSON.parse(text);
        arr=(json.vocab??json).map(x=>norm({kanji:x.kanji,kana:x.kana,romaji:x.romaji,meaning:(x.thai??x.meaning??''),jlpt:(x.jlpt??DEFAULT_LEVEL),category:(x.category??'ทั่วไป')}))
      }else{
        arr=parseCSV(text).map(row=>norm({kanji:row.kanji,kana:row.kana,romaji:row.romaji,meaning:row.meaning,jlpt:(row.jlpt||DEFAULT_LEVEL),category:(row.category||'ทั่วไป')}))
      }
      applyRaw(arr); alert('อัปโหลดคำศัพท์สำเร็จ');
    }catch{ alert('อ่านไฟล์ไม่สำเร็จ'); }
  });

  // Reset buttons
  $('#btnResetTest') && $('#btnResetTest').addEventListener('click', ()=>{ testState=null; startTestIfNeeded(); render(); drawHUD(); });
  $('#btnResetType') && $('#btnResetType').addEventListener('click', ()=>{ typeState=null; startTypeIfNeeded(); render(); drawHUD(); });

  $('#btnResetStats') && $('#btnResetStats').addEventListener('click', resetStats);
}
