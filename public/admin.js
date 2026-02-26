(function(){
  const socket = io();
  const status = document.getElementById('status');
  const cueTableBody = document.querySelector('#cueTable tbody');
  const addBtn = document.getElementById('addCue');
  const saveBtn = document.getElementById('save');
  const logEl = document.getElementById('adminLog');

  function log(msg){ if(!logEl) return; logEl.textContent = new Date().toLocaleTimeString() + ' ' + msg + '\n' + logEl.textContent; }

  function formatTime(sec) {
    if (!Number.isFinite(sec)) sec = 0;
    sec = Math.max(0, Math.floor(Number(sec)));
    const mm = Math.floor(sec / 60).toString().padStart(2, '0');
    const ss = (sec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  function parseTimeInput(v) {
    if (v === undefined || v === null) return null;
    v = String(v).trim();
    const m = v.match(/^\s*(\d+):(\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const minutes = Number(m[1]);
      const seconds = Number(m[2]);
      if (Number.isFinite(minutes) && Number.isFinite(seconds)) return Math.floor(minutes * 60 + seconds);
      return null;
    }
    const n = Number(v);
    if (!Number.isNaN(n) && isFinite(n) && n >= 0) return Math.floor(n);
    return null;
  }

  function renderCues(cues){
    cueTableBody.innerHTML = '';
    cues.forEach((c, idx) => {
      const tr = document.createElement('tr');
      const idTd = document.createElement('td');
      const targetTd = document.createElement('td');
      const leadTd = document.createElement('td');
      const actTd = document.createElement('td');
      const idInput = document.createElement('input'); idInput.value = c.id || ('cue' + (idx+1));
      const targetInput = document.createElement('input'); targetInput.type = 'text'; targetInput.placeholder = 'MM:SS or seconds'; targetInput.value = formatTime(c.target || 0);
      const leadInput = document.createElement('input'); leadInput.type = 'number'; leadInput.min = '0'; leadInput.value = (typeof c.lead === 'number') ? c.lead : 4;
      const delBtn = document.createElement('button'); delBtn.textContent = 'Remove';
      delBtn.addEventListener('click', () => { tr.remove(); });
      idTd.appendChild(idInput); targetTd.appendChild(targetInput); leadTd.appendChild(leadInput); actTd.appendChild(delBtn);
      tr.appendChild(idTd); tr.appendChild(targetTd); tr.appendChild(leadTd); tr.appendChild(actTd);
      cueTableBody.appendChild(tr);
    });
  }

  socket.on('connect', () => { status.textContent = 'connected'; log('connected'); socket.emit('request-cue-snapshot'); });
  socket.on('disconnect', () => { status.textContent = 'disconnected'; log('disconnected'); });

  socket.on('cue-snapshot', (msg) => {
    try {
      if (!msg || !Array.isArray(msg.cues)) return;
      renderCues(msg.cues);
      log('received snapshot (' + msg.cues.length + ')');
    } catch (e){ log('snapshot error ' + (e && e.message)); }
  });

  addBtn.addEventListener('click', () => {
    const defaultId = 'cue' + (cueTableBody.children.length + 1);
    renderCues([...(Array.from(cueTableBody.children).map(tr => ({ id: tr.children[0].firstChild.value, target: parseTimeInput(tr.children[1].firstChild.value) || 0, lead: Number(tr.children[2].firstChild.value || 4) }))), { id: defaultId, target: 0, lead: 4 }]);
  });

  saveBtn.addEventListener('click', () => {
    const rows = Array.from(cueTableBody.children);
    const cues = rows.map(tr => ({ id: String(tr.children[0].firstChild.value || '').trim(), target: (parseTimeInput(tr.children[1].firstChild.value) !== null) ? parseTimeInput(tr.children[1].firstChild.value) : Number(tr.children[1].firstChild.value || 0), lead: Number(tr.children[2].firstChild.value || 4) }));
    try { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; } catch (e) {}
    socket.emit('admin-set-cues', { cues });
    log('sent cues (' + cues.length + ') to server');
  });

  socket.on('admin-save-result', (res) => {
    try {
      if (res && res.ok) {
        status.textContent = 'Save succeeded';
        log('save succeeded');
      } else {
        status.textContent = 'Save failed' + (res && res.error ? (': ' + res.error) : '');
        log('save failed ' + (res && res.error ? res.error : ''));
      }
    } catch (e) {
      log('save result handling error ' + (e && e.message));
    } finally {
      try { saveBtn.disabled = false; saveBtn.textContent = 'Save Cues'; } catch (e) {}
      // refresh snapshot from server to ensure UI matches persisted file
      socket.emit('request-cue-snapshot');
      setTimeout(() => { if (status) status.textContent = 'connected'; }, 2000);
    }
  });

})();
