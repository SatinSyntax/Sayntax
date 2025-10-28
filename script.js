// ===== UI ELEMENTS =====
const editor = document.getElementById('editor');
const checkBtn = document.getElementById('checkBtn');
const fixAllBtn = document.getElementById('fixAllBtn');
const listenBtn = document.getElementById('listenBtn');
const clearBtn = document.getElementById('clearBtn');
const suggestionsEl = document.getElementById('suggestions');
const dialog = document.getElementById('resultDialog');
const issuesEl = document.getElementById('issues');
const husky = document.getElementById('husky');

// ===== HUSKY POP + MOVE =====
let huskyHideTimer;
editor.addEventListener('input', () => {
  husky.classList.remove('hidden');
  // playful nudge on each type
  husky.style.transform = `translateX(${Math.random()*6 - 3}px)`;
  clearTimeout(huskyHideTimer);
  huskyHideTimer = setTimeout(()=> husky.classList.add('hidden'), 1200);
});

// ===== LISTEN / TTS =====
listenBtn.addEventListener('click', () => {
  const txt = editor.value.trim();
  if (!txt) return;
  if (!('speechSynthesis' in window)) {
    alert('Speech not supported on this browser.');
    return;
    }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(txt);
  utter.rate = 1.02; utter.pitch = 1; utter.lang = 'en-US';
  window.speechSynthesis.speak(utter);
});

// ===== CLEAR =====
clearBtn.addEventListener('click', () => {
  editor.value = '';
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
});

// ===== GRAMMAR CHECK (LanguageTool public API) =====
async function checkGrammar(text) {
  const body = new URLSearchParams({
    text,
    language: 'en-US'
  });
  const res = await fetch('https://api.languagetool.org/v2/check', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body
  });
  if (!res.ok) throw new Error('Check failed');
  return res.json();
}

// Build friendly label for an issue
function issueLabel(match) {
  const rule = match.rule && (match.rule.description || match.rule.id) || 'Issue';
  const repl = (match.replacements?.[0]?.value) ? ` → Try: “${match.replacements[0].value}”` : '';
  return `${rule}${repl}`;
}

// Apply a single replacement
function applyReplacement(text, match, replacement) {
  const start = match.offset;
  const end = start + match.length;
  return text.slice(0, start) + replacement + text.slice(end);
}

// Rebuild offsets after multiple changes (simple approach)
function applyAll(text, matches) {
  // Apply from right to left so offsets stay valid
  const ordered = [...matches]
    .filter(m => m.replacements && m.replacements[0])
    .sort((a,b)=> (b.offset - a.offset));
  for (const m of ordered) {
    text = applyReplacement(text, m, m.replacements[0].value);
  }
  return text;
}

// Render inline suggestion list
function renderSuggestions(matches) {
  if (!matches.length) {
    suggestionsEl.innerHTML = `<div class="suggestion-item"><b>No issues found.</b> You’re shining ✨</div>`;
    suggestionsEl.classList.remove('hidden');
    return;
  }
  suggestionsEl.innerHTML = matches.map((m,i) => {
    const bad = editor.value.substr(m.offset, m.length);
    const suggestion = m.replacements?.[0]?.value || '';
    return `
      <div class="suggestion-item">
        <div><b>“${bad}”</b> — <small>${issueLabel(m)}</small></div>
        <div class="suggestion-actions">
          ${suggestion ? `<button class="inline-btn apply" data-i="${i}">Apply</button>` : ''}
          <button class="inline-btn" data-skip="${i}">Ignore</button>
        </div>
      </div>`;
  }).join('');
  suggestionsEl.classList.remove('hidden');

  // Wire buttons
  suggestionsEl.querySelectorAll('[data-i]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const i = +btn.dataset.i;
      const m = matches[i];
      const suggestion = m.replacements?.[0]?.value;
      if (!suggestion) return;
      editor.value = applyReplacement(editor.value, m, suggestion);
      // Re-run to refresh offsets/suggestions
      runCheck();
    });
  });
}

// Build dialog content
function openDialog(matches) {
  if (!matches.length) {
    issuesEl.innerHTML = `<div class="issue">No problems detected. Keep it up! 💫</div>`;
    dialog.showModal();
    return;
  }
  issuesEl.innerHTML = matches.map(m=>{
    const bad = editor.value.substr(m.offset, m.length);
    const tip = m.message || m.rule?.description || 'Consider improving this.';
    const better = m.replacements?.[0]?.value ? `<span class="good">${m.replacements[0].value}</span>` : '—';
    return `<div class="issue">
      <div><span class="bad">“${bad}”</span> — ${tip}</div>
      <div>Suggestion: ${better}</div>
    </div>`;
  }).join('');
  dialog.showModal();
}

// Debounced checker
let busy = false;
async function runCheck(showDialog = false){
  const text = editor.value;
  if (!text.trim()) { suggestionsEl.classList.add('hidden'); return; }
  try{
    busy = true;
    const data = await checkGrammar(text);
    const matches = data.matches || [];
    renderSuggestions(matches);
    if (showDialog) openDialog(matches);
    return matches;
  }catch(e){
    suggestionsEl.classList.remove('hidden');
    suggestionsEl.innerHTML = `<div class="suggestion-item">Couldn’t check right now. Try again in a bit.</div>`;
  }finally{ busy = false; }
}

// Buttons
checkBtn.addEventListener('click', ()=> runCheck(true));
fixAllBtn.addEventListener('click', async ()=>{
  const data = await runCheck(false);
  if (!data || !data.length) return;
  editor.value = applyAll(editor.value, data);
  runCheck(false);
});

// OPTIONAL: live suggestions while typing (light debounce)
let t;
editor.addEventListener('keyup', ()=>{
  clearTimeout(t);
  t = setTimeout(()=> { if (!busy) runCheck(false); }, 600);
});
