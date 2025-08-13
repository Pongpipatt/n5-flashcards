// Patched app.js placeholder
function setHasControls(enable){
  const stage = document.querySelector('.stage');
  if (!stage) return;
  stage.classList.toggle('has-controls', !!enable);
}

function showHintBar(onUse, used){
  const bar = $('#hintBar');
  setHasControls(true);
  if (used) {
    bar.classList.remove('hidden');
    bar.classList.add('show');
    return;
  }
  bar.innerHTML = `ต้องการ Hint ไหม? <button id="useHint" class="chip primary">ขอ Hint</button>`;
  bar.classList.remove('hidden');
  bar.classList.add('show');
  $('#useHint').onclick = ()=>{ onUse && onUse(); };
}

function hideHintBar(){
  const bar = $('#hintBar');
  bar.classList.remove('show');
  setTimeout(()=> bar.classList.add('hidden'), 200);
}
