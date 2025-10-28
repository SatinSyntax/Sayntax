// ===== Grab elements (only exists on app.html) =====
const editor = document.getElementById('editor');
const checkBtn = document.getElementById('checkBtn');
const fixAllBtn = document.getElementById('fixAllBtn');
const listenBtn = document.getElementById('listenBtn');
const clearBtn = document.getElementById('clearBtn');
const suggestionsEl = document.getElementById('suggestions');
const dialog = document.getElementById('resultDialog');
const issuesEl = document.getElementById('issues');
const husky = document.getElementById('husky');
const huskyRunner = document.getElementById('huskyRunner');
const toolbar = document.querySelector('.toolbar');

// If we're not on app.html, stop here (so index/about don't error)
if (!editor) {
  // No app elements on this page
} else {
  // ===== HUSKY POP WHEN TYPING =====
  let huskyHideTimer;
  editor.addEventListener('input', () => {
    if (husky) {
      husky.classList.remove('hidden');
      clearTimeout(huskyHideTimer);
      huskyHideTimer = setTimeout(()=> husky.classList.add('hidden'), 1200);
    }
    if (huskyRunner) huskyRunner.classList.remove('hidden');
  });

  // ===== LISTEN (TTS) =====
  listenBtn?.addEventListener('click', () => {
    const txt = editor.value.trim();
    if (!txt) return;
    if (!('speechSynthesis' in window)) { alert('Speech not supported on this browser.'); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.rate = 1.02; u.pitch = 1; u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  });

  // ===== CLEAR =====
  clearBtn?.addEventListener('click', () => {
    editor.value = '';
    suggestionsEl?.classList.add('hidden');
    if (suggestionsEl) suggestionsEl.innerHTML = '';
  });

  // ===== GRAMMAR CHECK (LanguageTool public API) =====
  async function checkGrammar(text) {
    const body = new URLSearchParams({ text, language: 'en-US' });
    const res = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body
    });
    if (!res.ok) throw new Error('Check failed');
    return res.json();
  }

  function issueLabel(m){
    const rule = m.rule && (m.rule.description || m.rule.id) || 'Issue';
    const repl = (m.replacements?.[0]?.value) ? ` → Try: “${m.replacements[0].value}”` : '';
    return `${rule}${repl}`;
  }

  function applyReplacement(text, match, replacement){
    const start = match.offset;
    const end = start + match.length;
    return text.slice(0, start) + replacement + text.slice(end);
  }

  function applyAll(text, matches){
    const ordered = [...matches].filter(m=>m.replacements && m.replacements[0]).sort((a,b)=>b.offset-a.offset);
    for (const m of ordered){ text = applyReplacement(text, m, m.replacements[0].value); }
    return text;
  }

  function renderSuggestions(matches){
    if (!suggestionsEl) return;
    if (!matches.length){
      suggestionsEl.innerHTML = `<div class="suggestion-item"><b>No issues found.</b> You’re shining ✨</div>`;
      suggestionsEl.classList.remove('hidden'); return;
    }
    suggestionsEl.innerHTML = matches.map((m,i)=>{
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

    suggestionsEl.querySelectorAll('[data-i]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const i = +btn.dataset.i;
        const m = matches[i];
        const suggestion = m.replacements?.[0]?.value;
        if (!suggestion) return;
        editor.value = applyReplacement(editor.value, m, suggestion);
        runCheck();
      });
    });
  }

  function openDialog(matches){
    if (!issuesEl || !dialog) return;
    if (!matches.length){
      issuesEl.innerHTML = `<div class="issue">No problems detected. Keep it up! 💫</div>`;
      dialog.showModal(); return;
    }
    issuesEl.innerHTML = matches.map(m=>{
      const bad = editor.value.substr(m.offset, m.length);
      const tip = m.message || m.rule?.description || 'Consider improving this.';
      const better = m.replacements?.[0]?.value ? `<span class="good">${m.replacements[0].value}</span>` : '—';
      return `<div class="issue"><div><span class="bad">“${bad}”</span> — ${tip}</div><div>Suggestion: ${better}</div></div>`;
    }).join('');
    dialog.showModal();
  }

  let busy=false;
  async function runCheck(showDialog=false){
    const text = editor.value;
    if (!text.trim()) { suggestionsEl?.classList.add('hidden'); return; }
    try{
      busy=true;
      const data = await checkGrammar(text);
      const matches = data.matches || [];
      renderSuggestions(matches);
      if (showDialog) openDialog(matches);
      return matches;
    }catch(e){
      if (suggestionsEl){
        suggestionsEl.classList.remove('hidden');
        suggestionsEl.innerHTML = `<div class="suggestion-item">Couldn’t check now. Try again in a bit.</div>`;
      }
    }finally{ busy=false; }
  }

  checkBtn?.addEventListener('click', ()=> runCheck(true));
  fixAllBtn?.addEventListener('click', async ()=>{
    const data = await runCheck(false);
    if (!data || !data.length) return;
    editor.value = applyAll(editor.value, data);
    runCheck(false);
  });

  // Live suggestions (debounced)
  let t;
  editor.addEventListener('keyup', ()=>{
    clearTimeout(t);
    t = setTimeout(()=> { if (!busy) runCheck(false); }, 600);
  });

  // Runner husky around toolbar
  if (huskyRunner && toolbar){
    toolbar.addEventListener('mousemove', (e)=>{
      const rect = toolbar.getBoundingClientRect();
      const x = e.clientX - rect.left - 26;
      const y = e.clientY - rect.top - 26;
      huskyRunner.style.transform = `translate(${x}px, ${y}px)`;
      huskyRunner.classList.remove('hidden');
      huskyRunner.style.opacity = '1';
    });
    toolbar.addEventListener('mouseleave', ()=>{
      huskyRunner.style.opacity = '0';
    });
  }
}
