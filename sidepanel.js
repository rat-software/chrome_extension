// sidepanel.js - Version 20.0 (Limit Updates)

let currentConfigs = [];
let currentSessionId = null;
let cachedTasks = [];
let currentTaskFilter = "ALL";

const COUNTRIES = {
    "au": { name: "Australia", googleDomain: "www.google.com.au" },
    "at": { name: "Austria", googleDomain: "www.google.at" },
    "be": { name: "Belgium", googleDomain: "www.google.be" },
    "br": { name: "Brazil", googleDomain: "www.google.com.br" },
    "ca": { name: "Canada", googleDomain: "www.google.ca" },
    "dk": { name: "Denmark", googleDomain: "www.google.dk" },
    "fi": { name: "Finland", googleDomain: "www.google.fi" },
    "fr": { name: "France", googleDomain: "www.google.fr" },
    "de": { name: "Germany", googleDomain: "www.google.de" },
    "in": { name: "India", googleDomain: "www.google.co.in" },
    "ie": { name: "Ireland", googleDomain: "www.google.ie" },
    "it": { name: "Italy", googleDomain: "www.google.it" },
    "jp": { name: "Japan", googleDomain: "www.google.co.jp" },
    "mx": { name: "Mexico", googleDomain: "www.google.com.mx" },
    "nl": { name: "Netherlands", googleDomain: "www.google.nl" },
    "nz": { name: "New Zealand", googleDomain: "www.google.co.nz" },
    "no": { name: "Norway", googleDomain: "www.google.no" },
    "pl": { name: "Poland", googleDomain: "www.google.pl" },
    "pt": { name: "Portugal", googleDomain: "www.google.pt" },
    "ru": { name: "Russia", googleDomain: "www.google.ru" },
    "sg": { name: "Singapore", googleDomain: "www.google.com.sg" },
    "es": { name: "Spain", googleDomain: "www.google.es" },
    "se": { name: "Sweden", googleDomain: "www.google.se" },
    "ch": { name: "Switzerland", googleDomain: "www.google.ch" },
    "uk": { name: "United Kingdom", googleDomain: "www.google.co.uk" },
    "us": { name: "USA", googleDomain: "www.google.com" }
};

const LANGUAGES = [
    { code: "", name: "Auto / Default" },
    { code: "en", name: "English" }, { code: "de", name: "German" },
    { code: "fr", name: "French" }, { code: "it", name: "Italian" },
    { code: "es", name: "Spanish" }, { code: "pt", name: "Portuguese" },
    { code: "nl", name: "Dutch" }, { code: "sv", name: "Swedish" },
    { code: "no", name: "Norwegian" }, { code: "da", name: "Danish" },
    { code: "fi", name: "Finnish" }, { code: "pl", name: "Polish" },
    { code: "ru", name: "Russian" }, { code: "ja", name: "Japanese" }
];

document.addEventListener('DOMContentLoaded', () => {
    initDropdowns('confCountrySelect', 'confLangSelect', 'confEngineSelect'); 
    initDropdowns('editConfCountrySelect', 'editConfLangSelect', null);     

    document.getElementById('createSessionBtn').addEventListener('click', () => { resetCreateForm(); showView('createView'); });
    document.getElementById('backBtn').addEventListener('click', () => showView('listView'));
    document.getElementById('backToListBtn').addEventListener('click', () => { currentSessionId = null; showView('listView'); chrome.runtime.sendMessage({ action: "GET_SESSIONS" }); });

    document.getElementById('addConfigBtn').addEventListener('click', () => {
        const countryKey = document.getElementById('confCountrySelect').value;
        const langCode = document.getElementById('confLangSelect').value;
        const location = document.getElementById('confLoc').value.trim();
        if (countryKey) {
            const countryData = COUNTRIES[countryKey];
            addConfig({
                engineId: "google", engineName: "Google", countryName: countryData.name,
                countryCode: (countryKey === "uk" ? "gb" : countryKey), domain: countryData.googleDomain,
                langCode, location
            });
        }
    });

    document.getElementById('useProxies').addEventListener('change', (e) => {
        document.getElementById('proxyList').disabled = !e.target.checked;
    });

    document.getElementById('startScrapeBtn').addEventListener('click', () => {
        const name = document.getElementById('sessName').value;
        const q = document.getElementById('sessQueries').value.split('\n').filter(x => x.trim());
        const useProxies = document.getElementById('useProxies').checked;
        const proxyListStr = document.getElementById('proxyList').value;
        const saveScreenshots = document.getElementById('saveScreenshots').checked;
        const saveHtml = document.getElementById('saveHtml').checked;

        if (name && q.length > 0 && currentConfigs.length > 0) {
            chrome.runtime.sendMessage({
                action: "CREATE_SESSION",
                payload: { 
                    name, queries: q, configs: currentConfigs, 
                    resultsLimit: parseInt(document.getElementById('sessLimit').value), 
                    delays: { min: parseInt(document.getElementById('sessMin').value) * 1000, max: parseInt(document.getElementById('sessMax').value) * 1000 },
                    saveScreenshots, saveHtml, useProxies, proxyListStr
                }
            });
        }
    });

    document.getElementById('playPauseBtn').addEventListener('click', () => {
        const btn = document.getElementById('playPauseBtn');
        if (btn.innerText === "Pause") chrome.runtime.sendMessage({ action: "PAUSE", payload: { sessionId: currentSessionId } });
        else chrome.runtime.sendMessage({ action: "START", payload: { sessionId: currentSessionId } });
    });

    document.getElementById('stopBtn').addEventListener('click', () => { if (confirm("Delete session?")) { chrome.runtime.sendMessage({ action: "DELETE_SESSION", payload: { sessionId: currentSessionId } }); showView('listView'); } });
    document.getElementById('downloadBtn').addEventListener('click', () => chrome.runtime.sendMessage({ action: "DOWNLOAD_DATA", payload: { sessionId: currentSessionId } }));
    document.getElementById('exportAllBtn').addEventListener('click', () => chrome.runtime.sendMessage({ action: "EXPORT_SESSIONS" }));
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f.name.endsWith('.zip')) chrome.runtime.sendMessage({ action: "IMPORT_FULL_BACKUP", payload: { file: f } });
    });
    
    document.getElementById('applyDelayBtn').addEventListener('click', () => {
        const min = parseInt(document.getElementById('liveMin').value);
        const max = parseInt(document.getElementById('liveMax').value);
        if(currentSessionId && min && max) chrome.runtime.sendMessage({ action: "UPDATE_DELAY", payload: { sessionId: currentSessionId, min, max }});
    });

    // NEW: LIMIT UPDATE
    document.getElementById('applyLimitBtn').addEventListener('click', () => {
        const limit = parseInt(document.getElementById('liveLimit').value);
        if(currentSessionId && limit) chrome.runtime.sendMessage({ action: "UPDATE_LIMIT", payload: { sessionId: currentSessionId, limit: limit }});
    });

    document.getElementById('submitNewQueries').addEventListener('click', () => {
        const txt = document.getElementById('addQueryInput').value;
        const queries = txt.split('\n').filter(x => x.trim());
        if(queries.length > 0 && currentSessionId) {
            chrome.runtime.sendMessage({ action: "ADD_ITEMS", payload: { sessionId: currentSessionId, newQueries: queries } });
            document.getElementById('addQueryInput').value = "";
            alert(`Added ${queries.length} queries to queue.`);
        }
    });

    document.getElementById('submitNewEngine').addEventListener('click', () => {
        const countryKey = document.getElementById('editConfCountrySelect').value;
        const langCode = document.getElementById('editConfLangSelect').value;
        const location = document.getElementById('editConfLoc').value.trim();
        
        if (countryKey && currentSessionId) {
            const countryData = COUNTRIES[countryKey];
            const newConfig = {
                engineId: "google", engineName: "Google", countryName: countryData.name,
                countryCode: (countryKey === "uk" ? "gb" : countryKey), domain: countryData.googleDomain,
                langCode, location
            };
            if(confirm(`Add Google ${countryData.name} and generate tasks for ALL existing keywords?`)) {
                chrome.runtime.sendMessage({ action: "ADD_ITEMS", payload: { sessionId: currentSessionId, newConfigs: [newConfig] } });
            }
        }
    });

    document.getElementById('saveProxySettings').addEventListener('click', () => {
        const useProxies = document.getElementById('editUseProxies').checked;
        const proxyListStr = document.getElementById('editProxyList').value;
        if(currentSessionId) {
            chrome.runtime.sendMessage({ action: "UPDATE_PROXIES", payload: { sessionId: currentSessionId, useProxies, proxyListStr } });
            alert("Proxy settings updated.");
        }
    });

    document.getElementById('refreshTasksBtn').addEventListener('click', () => {
        if(currentSessionId) {
            document.getElementById('taskListContainer').innerHTML = "<div style='padding:10px;text-align:center'>Loading...</div>";
            chrome.runtime.sendMessage({ action: "GET_TASKS", payload: { sessionId: currentSessionId } });
        }
    });

    document.getElementById('taskManagerDetails').addEventListener('toggle', (e) => {
        if (e.target.open && currentSessionId) {
            chrome.runtime.sendMessage({ action: "GET_TASKS", payload: { sessionId: currentSessionId } });
        }
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTaskFilter = e.target.getAttribute('data-filter');
            renderTasks();
        });
    });

    chrome.runtime.sendMessage({ action: "GET_SESSIONS" });
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SESSION_LIST") renderList(msg.payload);
    if (msg.type === "SESSION_STATUS") updateStatus(msg.payload);
    if (msg.type === "LOG_ENTRY" && msg.payload.sessionId === currentSessionId) addSingleLog(msg.payload.entry);
    if (msg.type === "SESSION_CREATED") { showView('listView'); chrome.runtime.sendMessage({ action: "GET_SESSIONS" }); }
    
    if (msg.type === "TASK_LIST_UPDATE" && msg.payload.sessionId === currentSessionId) {
        cachedTasks = msg.payload.tasks;
        renderTasks();
    }
});

function initDropdowns(cId, lId, eId) {
    const cSelect = document.getElementById(cId);
    const lSelect = document.getElementById(lId);
    
    if(eId) {
        const eSelect = document.getElementById(eId);
        const opt = document.createElement('option'); opt.value = "google"; opt.innerText = "Google"; eSelect.appendChild(opt);
    }
    
    Object.keys(COUNTRIES).sort((a, b) => COUNTRIES[a].name.localeCompare(COUNTRIES[b].name)).forEach(key => { 
        const opt = document.createElement('option'); opt.value = key; opt.innerText = COUNTRIES[key].name; cSelect.appendChild(opt); 
    });
    LANGUAGES.forEach(l => { 
        const opt = document.createElement('option'); opt.value = l.code; opt.innerText = l.name; lSelect.appendChild(opt); 
    });
    cSelect.value = "us"; lSelect.value = "en";
}

function showView(id) { document.querySelectorAll('.view').forEach(e => e.style.display = 'none'); document.getElementById(id).style.display = 'block'; }

function renderList(sessions) {
    const div = document.getElementById('sessionList');
    div.innerHTML = sessions.length ? "" : "<div style='color:#999;text-align:center;padding:10px'>No studies found.</div>";
    sessions.forEach(s => {
        const el = document.createElement('div');
        el.className = "session-card" + (s.status === "RUNNING" ? " session-running" : (s.status === "PAUSED_CAPTCHA" ? " session-paused-captcha" : ""));
        el.innerHTML = `<strong>${s.name}</strong> <span style="font-size:10px; color:#666">[${s.status}]</span><br><small>Tasks: ${s.progress.done}/${s.progress.total}</small>`;
        el.onclick = () => openSession(s.id);
        div.appendChild(el);
    });
}

function openSession(id) { 
    currentSessionId = id; 
    document.getElementById('logContainer').innerHTML = ""; 
    showView('statusView'); 
    chrome.runtime.sendMessage({ action: "GET_SESSION_STATUS", payload: { sessionId: id } }); 
}

function updateStatus(data) {
    if (data.sessionId !== currentSessionId) return;
    document.getElementById('statusTitle').innerText = data.name;
    
    const statusEl = document.getElementById('statusState');
    statusEl.innerText = data.status;
    
    if (data.status === "PAUSED_CAPTCHA") {
        statusEl.style.color = "#dc3545"; statusEl.innerText = "PAUSED (CAPTCHA)";
    } else {
        statusEl.style.color = "black";
    }

    document.getElementById('currentQuery').innerText = data.currentQuery || "-";
    document.getElementById('progressBar').style.width = (data.progress.done / data.progress.total * 100) + "%";
    document.getElementById('progressText').innerText = `${data.progress.done}/${data.progress.total} Tasks`;
    
    if (data.logs && document.getElementById('logContainer').innerHTML === "") data.logs.forEach(addSingleLog);
    
    const btn = document.getElementById('playPauseBtn');
    if (data.status === "RUNNING") {
        btn.innerText = "Pause"; btn.classList.remove("btn-success"); btn.classList.add("btn-primary");
    } else {
        btn.innerText = "Resume / Start"; btn.classList.add("btn-success"); btn.classList.remove("btn-primary");
    }

    if (data.originalConfigs) {
        const list = document.getElementById('activeEnginesList');
        list.innerHTML = "";
        data.originalConfigs.forEach((conf, index) => {
            const span = document.createElement('span');
            span.className = 'engine-tag';
            
            const text = document.createTextNode(`${conf.countryName} (${conf.langCode||'Auto'})`);
            span.appendChild(text);

            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-engine-btn';
            removeBtn.innerHTML = "&times;";
            removeBtn.title = "Remove engine & cancel pending tasks";
            removeBtn.onclick = (e) => {
                e.stopPropagation(); 
                if(confirm(`Remove ${conf.countryName}?\n\nThis will CANCEL all pending tasks for this engine.\nExisting results remain safe.`)) {
                    chrome.runtime.sendMessage({ 
                        action: "REMOVE_CONFIG", 
                        payload: { sessionId: currentSessionId, configIndex: index } 
                    });
                }
            };
            span.appendChild(removeBtn);

            list.appendChild(span);
        });
    }
    
    if (data.originalQueries) {
        document.getElementById('totalQueriesCount').innerText = data.originalQueries.length;
    }

    const proxyArea = document.getElementById('editProxyList');
    if (document.activeElement !== proxyArea && data.settings) {
         document.getElementById('editUseProxies').checked = data.settings.useProxies;
         document.getElementById('editProxyList').value = data.settings.proxyList ? data.settings.proxyList.join('\n') : "";
         
         setSettingBadge('badgeScreenshots', data.settings.saveScreenshots);
         setSettingBadge('badgeHtml', data.settings.saveHtml);
         setSettingBadge('badgeProxies', data.settings.useProxies);
    }

    const minInput = document.getElementById('liveMin');
    const maxInput = document.getElementById('liveMax');
    if (data.delays && document.activeElement !== minInput && document.activeElement !== maxInput) {
        minInput.value = data.delays.min / 1000;
        maxInput.value = data.delays.max / 1000;
    }

    // NEW: LIVE LIMIT FEEDBACK
    const limitInput = document.getElementById('liveLimit');
    if (data.globalCount && document.activeElement !== limitInput) {
        limitInput.value = data.globalCount;
    }
}

function setSettingBadge(id, isActive) {
    const el = document.getElementById(id);
    if(isActive) el.classList.add('setting-active');
    else el.classList.remove('setting-active');
}

function addSingleLog(entry) {
    const div = document.getElementById('logContainer');
    let color = "#333";
    if (entry.level === "WARN") color = "#856404";
    if (entry.level === "ERROR") color = "#721c24";
    div.innerHTML += `<div style="border-bottom:1px solid #eee;padding:2px 0; color:${color}">
        <span style="color:#999;margin-right:5px;font-size:10px">[${new Date(entry.ts).toLocaleTimeString()}]</span>${entry.msg}
    </div>`;
    div.scrollTop = div.scrollHeight;
}

function addConfig(c) { currentConfigs.push(c); renderConfigs(); }
function renderConfigs() {
    const list = document.getElementById('addedConfigsList');
    list.innerHTML = "";
    currentConfigs.forEach((c, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${c.countryName} (${c.langCode || 'Auto'})</span> <span style="color:red;cursor:pointer;font-weight:bold">×</span>`;
        li.querySelector('span:last-child').onclick = () => { currentConfigs.splice(i, 1); renderConfigs(); };
        list.appendChild(li);
    });
}

function resetCreateForm() { 
    document.getElementById('sessName').value = ""; 
    document.getElementById('sessQueries').value = ""; 
    document.getElementById('saveScreenshots').checked = true;
    document.getElementById('saveHtml').checked = true; 
    document.getElementById('useProxies').checked = false;
    document.getElementById('proxyList').value = "";
    document.getElementById('proxyList').disabled = true;
    currentConfigs = []; 
    renderConfigs(); 
}

function renderTasks() {
    const container = document.getElementById('taskListContainer');
    const countDisplay = document.getElementById('taskCountDisplay');
    
    let filtered = cachedTasks;
    if (currentTaskFilter !== "ALL") {
        filtered = cachedTasks.filter(t => t.status === currentTaskFilter);
    }

    countDisplay.innerText = filtered.length;

    if (filtered.length === 0) {
        container.innerHTML = "<div style='padding:10px; text-align:center; color:#999; font-size:11px'>No tasks found for this filter.</div>";
        return;
    }

    let html = "";
    filtered.forEach(t => {
        const statusClass = `st-${t.status}`;
        const showDelete = (t.status === "OPEN" || t.status === "FAILED") ? "visible" : "hidden";
        
        html += `
        <div class="task-item">
            <div style="flex:1; overflow:hidden;">
                <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${t.term}">${t.term}</div>
                <div style="color:#888; font-size:10px;">${t.country.toUpperCase()} - ${t.lang || 'Auto'}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="status-badge ${statusClass}">${t.status}</span>
                <span class="del-task-btn" style="visibility:${showDelete}" onclick="deleteTask(${t.index})">&times;</span>
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

window.deleteTask = function(index) {
    if(!currentSessionId) return;
    
    chrome.runtime.sendMessage({ 
        action: "REMOVE_TASK", 
        payload: { sessionId: currentSessionId, taskIndex: index } 
    });
    
    const task = cachedTasks.find(t => t.index === index);
    if(task) { 
        task.status = "CANCELLED"; 
        renderTasks(); 
    }
};