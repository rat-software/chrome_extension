// background.js - Version 21.0 (Fixed UI Lag)

// --- 0. POWER & IMPORTS ---
try {
    chrome.power.requestKeepAwake('system');
} catch (e) {
    console.warn("Power API not available (Add 'power' to manifest).");
}

try {
    importScripts('jszip.min.js');
} catch (e) {
    console.error("CRITICAL: jszip.min.js missing.");
}

const DB_NAME = "RAT_Database_V7";
const STORE_SESSIONS = "sessions";
const STORE_RESULTS = "results";
const STORE_LOGS = "logs";
const MAX_PAGES = 15;

// --- Variablen ---
const RETRY_DELAYS = [5, 15, 30, 60]; // Minuten
let activeCaptchaListeners = {}; 
let db;
let currentProxyAuth = null; 

// --- PROXY AUTHENTICATION HANDLER ---
chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        if (currentProxyAuth) {
            return {
                authCredentials: {
                    username: currentProxyAuth.username,
                    password: currentProxyAuth.password
                }
            };
        }
        return {}; 
    },
    { urls: ["<all_urls>"] },
    ["blocking"]
);

async function setRandomProxy(sessionId, proxyList) {
    if (!proxyList || proxyList.length === 0) return false;

    const randomLine = proxyList[Math.floor(Math.random() * proxyList.length)];
    const parts = randomLine.trim().split(':');

    if (parts.length !== 4) {
        logToSession(sessionId, "⚠️ Invalid Proxy Format (Expected IP:Port:User:Pass).", "WARN");
        return false;
    }

    const [ip, port, user, pass] = parts;

    const config = {
        mode: "fixed_servers",
        rules: {
            singleProxy: {
                scheme: "http",
                host: ip,
                port: parseInt(port)
            },
            bypassList: ["localhost", "127.0.0.1"]
        }
    };

    currentProxyAuth = { username: user, password: pass };

    return new Promise((resolve) => {
        chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
            logToSession(sessionId, `🛡️ Proxy switched to ${ip} (Auth injected)`);
            resolve(true);
        });
    });
}

// --- ALARM LISTENER ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name.startsWith("retry_session_")) {
        const sessionId = alarm.name.replace("retry_session_", "");
        
        const storage = await chrome.storage.local.get([`retry_${sessionId}`, `tab_${sessionId}`]);
        const tabId = storage[`tab_${sessionId}`];
        let currentRetries = storage[`retry_${sessionId}`] || 0;

        if (!db) await initDB();
        
        logToSession(sessionId, `⏰ ALARM: Zeit abgelaufen. Service Worker geweckt. Starte Neustart...`, "INFO");

        if (tabId) {
            try { await chrome.tabs.remove(tabId); } catch(e) {}
        }

        currentRetries++;
        await chrome.storage.local.set({ [`retry_${sessionId}`]: currentRetries });

        resumeSession(sessionId);
    }
});

// --- 1. INITIALIZATION ---
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 7);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
                db.createObjectStore(STORE_SESSIONS, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(STORE_RESULTS)) {
                db.createObjectStore(STORE_RESULTS);
            }
            if (!db.objectStoreNames.contains(STORE_LOGS)) {
                db.createObjectStore(STORE_LOGS, { autoIncrement: true });
            }
        };
        request.onsuccess = () => {
            db = request.result;
            resolve();
        };
        request.onerror = () => reject("DB Error");
    });
}

// --- 2. LOGGING ENGINE ---
async function logToSession(sessionId, text, level = "INFO") {
    if (!db) await initDB();
    const entry = {
        sessionId,
        ts: new Date().toISOString(),
        msg: text,
        level: level
    };
    const tx = db.transaction(STORE_LOGS, "readwrite");
    tx.objectStore(STORE_LOGS).add(entry);
    chrome.runtime.sendMessage({
        type: "LOG_ENTRY",
        payload: { sessionId, entry }
    }).catch(() => { });
}

async function getLogs(sessionId) {
    if (!db) await initDB();
    return new Promise(r => {
        const tx = db.transaction(STORE_LOGS, "readonly");
        const req = tx.objectStore(STORE_LOGS).getAll();
        req.onsuccess = () => r(req.result.filter(l => l.sessionId === sessionId));
    });
}

// --- 3. DATA HELPERS ---
async function saveSession(session) {
    if (!db) await initDB();
    const tx = db.transaction(STORE_SESSIONS, "readwrite");
    tx.objectStore(STORE_SESSIONS).put(session);
    return new Promise(r => tx.oncomplete = r);
}

async function getSession(id) {
    if (!db) await initDB();
    const tx = db.transaction(STORE_SESSIONS, "readonly");
    return new Promise(r => {
        const req = tx.objectStore(STORE_SESSIONS).get(id);
        req.onsuccess = () => r(req.result);
    });
}

async function getAllSessions() {
    if (!db) await initDB();
    const tx = db.transaction(STORE_SESSIONS, "readonly");
    return new Promise(r => {
        const req = tx.objectStore(STORE_SESSIONS).getAll();
        req.onsuccess = () => r(req.result);
    });
}

async function savePageContent(sessionId, taskIdx, pageNum, content) {
    const tx = db.transaction(STORE_RESULTS, "readwrite");
    tx.objectStore(STORE_RESULTS).put(content, `${sessionId}_${taskIdx}_${pageNum}`);
}

async function getPageContent(sessionId, taskIdx, pageNum) {
    const tx = db.transaction(STORE_RESULTS, "readonly");
    return new Promise(r => {
        const req = tx.objectStore(STORE_RESULTS).get(`${sessionId}_${taskIdx}_${pageNum}`);
        req.onsuccess = () => r(req.result);
    });
}

async function isPaused(sessionId) {
    const s = await getSession(sessionId);
    return (!s || (s.status !== "RUNNING"));
}

// --- 4. MESSAGING ---
chrome.runtime.onInstalled.addListener(async () => {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => { });
    await initDB();
    chrome.proxy.settings.clear({ scope: 'regular' });
});

chrome.runtime.onStartup.addListener(() => initDB());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "IMPORT_FULL_BACKUP") {
        importFullBackup(msg.payload.file).then(() => sendResponse({ success: true }));
    } else {
        handleMessage(msg).then(sendResponse);
    }
    return true;
});

async function handleMessage(msg) {
    if (!db) await initDB();
    switch (msg.action) {
        case "GET_SESSIONS": broadcastSessionList(); break;
        case "CREATE_SESSION": createNewSession(msg.payload); break;
        case "GET_SESSION_STATUS": if (msg.payload.sessionId) broadcastSessionStatus(msg.payload.sessionId); break;
        case "START": if (msg.payload.sessionId) startSession(msg.payload.sessionId); break;
        case "PAUSE": if (msg.payload.sessionId) pauseSession(msg.payload.sessionId); break;
        case "DELETE_SESSION": if (msg.payload.sessionId) deleteSession(msg.payload.sessionId); break;
        case "DOWNLOAD_DATA": exportDataAsZip(msg.payload.sessionId); break;
        case "EXPORT_SESSIONS": exportFullBackup(); break;
        
        // --- UPDATES ---
        case "UPDATE_DELAY": updateSessionDelay(msg.payload); break;
        case "UPDATE_LIMIT": updateSessionLimit(msg.payload); break; 
        
        // --- MANAGING ACTIONS ---
        case "ADD_ITEMS": addItemsToSession(msg.payload); break;
        case "UPDATE_PROXIES": updateSessionProxies(msg.payload); break;
        case "REMOVE_CONFIG": removeConfigFromSession(msg.payload); break;
        
        case "GET_TASKS": broadcastSessionTasks(msg.payload.sessionId); break;
        case "REMOVE_TASK": removeSingleTask(msg.payload); break;
    }
}

// --- 5. SMART CAPTCHA HANDLER ---

async function handleCaptchaEvent(sessionId, tabId) {
    const s = await getSession(sessionId);
    if (!s || s.status !== "RUNNING") return;

    s.status = "PAUSED_CAPTCHA";
    await saveSession(s);
    broadcastSessionStatus(sessionId);

    const storageKeyRetry = `retry_${sessionId}`;
    const storageKeyProxyTry = `proxy_try_${sessionId}`;
    
    const storage = await chrome.storage.local.get([storageKeyRetry, storageKeyProxyTry]);
    const retryCount = storage[storageKeyRetry] || 0;
    const proxyTryCount = storage[storageKeyProxyTry] || 0;

    const useProxies = s.settings && s.settings.useProxies;
    const proxyList = s.settings && s.settings.proxyList || [];

    if (useProxies && proxyList.length > 0 && proxyTryCount < 3) {
        logToSession(sessionId, `🛡️ CAPTCHA erkannt. Versuche Proxy-Wechsel (${proxyTryCount + 1}/3)...`, "WARN");
        cleanupCaptchaHandling(sessionId);
        await setRandomProxy(sessionId, proxyList);
        try { await chrome.tabs.remove(tabId); } catch(e) {}
        await chrome.storage.local.set({ [storageKeyProxyTry]: proxyTryCount + 1 });
        logToSession(sessionId, "🔄 Task-Neustart mit neuer IP...", "INFO");
        resumeSession(sessionId);
        return; 
    }

    if (proxyTryCount >= 3) {
        logToSession(sessionId, "❌ 3 Proxy-Versuche gescheitert. Deaktiviere Proxies & gehe in den Langzeit-Modus.", "ERROR");
        await new Promise(r => chrome.proxy.settings.clear({ scope: 'regular' }, r));
        currentProxyAuth = null;
        logToSession(sessionId, "🌍 Verbindung zurückgesetzt auf Direct Connection.", "INFO");
        try { await chrome.tabs.reload(tabId); } catch(e) {}
        await chrome.storage.local.set({ [storageKeyProxyTry]: 0 });
    }

    await chrome.storage.local.set({ [`tab_${sessionId}`]: tabId });
    const retryLevel = Math.min(retryCount, RETRY_DELAYS.length - 1);
    const waitMinutes = RETRY_DELAYS[retryLevel];
    
    logToSession(sessionId, `🛡️ Automation pausiert.`, "WARN");
    logToSession(sessionId, `👉 A: Manuell lösen (Überwachung aktiv).`, "INFO");
    logToSession(sessionId, `👉 B: Auto-Retry (via Chrome Alarm) in ${waitMinutes} Minuten.`, "INFO");

    cleanupCaptchaHandling(sessionId);

    const onTabUpdated = async (updatedTabId, changeInfo, tab) => {
        if (updatedTabId !== tabId) return;
        const currentUrl = (tab.url || changeInfo.url || "").toLowerCase();
        const seemsSafe = currentUrl.includes("google") && !currentUrl.includes("/sorry/") && !currentUrl.includes("captcha");

        if (seemsSafe && !onTabUpdated.isResolving) {
            onTabUpdated.isResolving = true; 
            await sleep(1500); 
            try {
                let check = await chrome.tabs.sendMessage(tabId, { action: "CHECK_CAPTCHA" }).catch(() => null);
                if (!check) {
                    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] }).catch(() => {});
                    await sleep(500);
                    check = await chrome.tabs.sendMessage(tabId, { action: "CHECK_CAPTCHA" }).catch(() => null);
                }
                if (check && !check.isCaptcha) {
                    logToSession(sessionId, "✅ URL sauber & Captcha weg! Setze fort...", "SUCCESS");
                    cleanupCaptchaHandling(sessionId);
                    await chrome.storage.local.set({ [storageKeyRetry]: 0, [storageKeyProxyTry]: 0 });
                    resumeSession(sessionId);
                } else {
                    onTabUpdated.isResolving = false;
                }
            } catch (e) {
                onTabUpdated.isResolving = false;
            }
        }
    };

    chrome.tabs.onUpdated.addListener(onTabUpdated);
    activeCaptchaListeners[sessionId] = onTabUpdated;
    chrome.alarms.create(`retry_session_${sessionId}`, { delayInMinutes: waitMinutes });
}

function cleanupCaptchaHandling(sessionId) {
    chrome.alarms.clear(`retry_session_${sessionId}`);
    if (activeCaptchaListeners[sessionId]) {
        chrome.tabs.onUpdated.removeListener(activeCaptchaListeners[sessionId]);
        delete activeCaptchaListeners[sessionId];
    }
}

async function resumeSession(sessionId) {
    if (!db) await initDB();
    const s = await getSession(sessionId);
    if (s) {
        s.status = "RUNNING";
        await saveSession(s);
        broadcastSessionStatus(sessionId);
        processQueue(sessionId);
    }
}

// --- 6. SCRAPER CORE ---

async function broadcastSessionTasks(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return;

    const simplifiedTasks = session.tasks.map((t, index) => ({
        index: index,
        term: t.term,
        country: t.config.countryCode,
        lang: t.config.langCode,
        status: t.status,
        retryCount: t.retryCount
    }));

    chrome.runtime.sendMessage({
        type: "TASK_LIST_UPDATE",
        payload: { sessionId, tasks: simplifiedTasks }
    }).catch(() => {});
}

async function removeSingleTask(payload) {
    const { sessionId, taskIndex } = payload;
    const session = await getSession(sessionId);
    if (!session) return;

    const task = session.tasks[taskIndex];
    if (!task) return;

    if (task.status === "DONE") {
        logToSession(sessionId, "⚠️ Cannot remove completed task.", "WARN");
        return;
    }

    task.status = "CANCELLED";
    await saveSession(session);
    
    broadcastSessionStatus(sessionId); 
    broadcastSessionTasks(sessionId);  
}

async function addItemsToSession(payload) {
    const { sessionId, newQueries, newConfigs } = payload;
    const session = await getSession(sessionId);
    if (!session) return;

    let newTasks = [];

    if (newQueries && newQueries.length > 0) {
        const configsToRun = session.originalConfigs; 
        const tasks = newQueries.flatMap(q => configsToRun.map(conf => ({
            term: q, config: conf, status: "OPEN", pages: [], totalOrganic: 0, retryCount: 0
        })));
        newTasks = newTasks.concat(tasks);
        session.originalQueries = [...session.originalQueries, ...newQueries];
        logToSession(sessionId, `➕ Added ${newQueries.length} new queries.`);
    }

    if (newConfigs && newConfigs.length > 0) {
        const queriesToRun = session.originalQueries;
        const tasks = queriesToRun.flatMap(q => newConfigs.map(conf => ({
            term: q, config: conf, status: "OPEN", pages: [], totalOrganic: 0, retryCount: 0
        })));
        newTasks = newTasks.concat(tasks);
        session.originalConfigs = [...session.originalConfigs, ...newConfigs];
        logToSession(sessionId, `➕ Added ${newConfigs.length} new search engines.`);
    }

    if (newTasks.length > 0) {
        session.tasks = [...session.tasks, ...newTasks];
        await saveSession(session);
        broadcastSessionStatus(sessionId);
        
        if (session.status === "DONE") {
             session.status = "PAUSED"; 
             await saveSession(session);
             logToSession(sessionId, "ℹ️ New tasks added. Press START to resume.");
        } else if (session.status === "RUNNING") {
             processQueue(sessionId); 
        }
    }
}

async function removeConfigFromSession(payload) {
    const { sessionId, configIndex } = payload;
    const session = await getSession(sessionId);
    if (!session) return;

    const configToRemove = session.originalConfigs[configIndex];
    if (!configToRemove) return;

    const newConfigs = session.originalConfigs.filter((_, idx) => idx !== configIndex);
    session.originalConfigs = newConfigs;

    let cancelledCount = 0;
    session.tasks.forEach(task => {
        if (task.config.countryCode === configToRemove.countryCode && 
            task.config.langCode === configToRemove.langCode &&
            task.config.domain === configToRemove.domain) {
            
            if (task.status === "OPEN" || task.status === "FAILED") {
                task.status = "CANCELLED";
                cancelledCount++;
            }
        }
    });

    await saveSession(session);
    logToSession(sessionId, `🗑️ Removed Engine: ${configToRemove.countryName}. Cancelled ${cancelledCount} pending tasks.`);
    broadcastSessionStatus(sessionId);
}

async function updateSessionProxies(payload) {
    const { sessionId, useProxies, proxyListStr } = payload;
    const session = await getSession(sessionId);
    if (!session) return;

    let proxyList = [];
    if (useProxies && proxyListStr) {
        proxyList = proxyListStr.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    }

    session.settings.useProxies = useProxies;
    session.settings.proxyList = proxyList;
    
    if (useProxies) {
        await chrome.storage.local.set({ [`proxy_try_${sessionId}`]: 0 });
    } else {
        chrome.proxy.settings.clear({ scope: 'regular' });
        currentProxyAuth = null;
    }

    await saveSession(session);
    logToSession(sessionId, `🛡️ Proxy Settings updated. Active: ${useProxies}, Count: ${proxyList.length}`);
    broadcastSessionStatus(sessionId);
}

async function createNewSession(payload) {
    const { name, queries, configs, resultsLimit, delays, saveScreenshots, saveHtml, useProxies, proxyListStr } = payload;
    
    let proxyList = [];
    if (useProxies && proxyListStr) {
        proxyList = proxyListStr.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    }

    const id = "sess_" + Date.now();
    const tasks = queries.flatMap(q => configs.map(conf => ({
        term: q, config: conf, status: "OPEN", pages: [], totalOrganic: 0, retryCount: 0
    })));
    
    const settings = {
        saveScreenshots: !!saveScreenshots,
        saveHtml: !!saveHtml,
        useProxies: !!useProxies,
        proxyList: proxyList
    };

    const session = { 
        id, name, status: "OPEN", tasks, currentIndex: 0, globalCount: resultsLimit, delays, settings, originalConfigs: configs, originalQueries: queries
    };
    
    await saveSession(session);
    chrome.runtime.sendMessage({ type: "SESSION_CREATED" }).catch(() => { });
}

async function startSession(id) {
    const s = await getSession(id);
    if (!s) return;
    s.status = "RUNNING";
    await chrome.storage.local.set({ [`retry_${id}`]: 0, [`proxy_try_${id}`]: 0 });
    await saveSession(s);
    broadcastSessionStatus(id);
    processQueue(id);
}

async function pauseSession(id, reason = "USER", tabId = null) {
    const s = await getSession(id);
    if (s) {
        if (reason === "USER") cleanupCaptchaHandling(id);
        s.status = reason === "CAPTCHA" ? "PAUSED_CAPTCHA" : "PAUSED";
        await saveSession(s);
        const msg = reason === "CAPTCHA" ? "⚠️ PAUSE: CAPTCHA detected." : "⏸️ PAUSE: Scraper received interrupt signal.";
        logToSession(id, msg, reason === "CAPTCHA" ? "WARN" : "INFO");
        broadcastSessionStatus(id);
        if (reason === "CAPTCHA" && tabId) handleCaptchaEvent(id, tabId);
    }
}

async function deleteSession(id) {
    cleanupCaptchaHandling(id);
    const tx = db.transaction([STORE_SESSIONS, STORE_RESULTS, STORE_LOGS], "readwrite");
    tx.objectStore(STORE_SESSIONS).delete(id);
    await new Promise(r => tx.oncomplete = r);
    broadcastSessionList();
}

async function processQueue(sessionId) {
    let session = await getSession(sessionId);
    if (!session || session.status !== "RUNNING") return;

    const nextIdx = session.tasks.findIndex(t => t.status === "OPEN");
    if (nextIdx === -1) {
        session.status = "DONE";
        await saveSession(session);
        logToSession(sessionId, "🏁 FINISHED: Study completed.");
        broadcastSessionStatus(sessionId);
        return;
    }

    session.currentIndex = nextIdx;
    const currentTask = session.tasks[nextIdx];
    
    // --- BUGFIX: Index sofort speichern, damit UI synchron ist ---
    await saveSession(session);

    let collectedOrganic = currentTask.totalOrganic || 0;
    let currentPage = currentTask.pages.length + 1;

    const existingUrls = new Set();
    currentTask.pages.forEach(p => p.results.organic.forEach(r => existingUrls.add(r.url)));

    logToSession(sessionId, `🚀 TASK START: "${currentTask.term}" (Current: ${collectedOrganic}/${session.globalCount})`);
    broadcastSessionStatus(sessionId);

    let tabId = null;
    try {
        const url = buildSearchUrl(currentTask.term, currentTask.config);
        logToSession(sessionId, `🔗 INITIALIZING: ${url}`);

        const tab = await new Promise(r => chrome.tabs.create({ url, active: true }, r));
        tabId = tab.id;

        while (collectedOrganic < session.globalCount && currentPage <= MAX_PAGES) {

            if (await isPaused(sessionId)) break;

            logToSession(sessionId, `🌐 LOADING: Waiting for Page ${currentPage}...`);
            await waitForTabSmart(tabId);

            if (await isPaused(sessionId)) break;
            
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            await sleep(getRandomDelay(2000, 4000));

            let preCheck = await chrome.tabs.sendMessage(tabId, { action: "CHECK_CAPTCHA" }).catch(() => null);
            if (preCheck && preCheck.isCaptcha) {
                await handleCaptchaEvent(sessionId, tabId);
                return;
            }

            logToSession(sessionId, `📜 BEHAVIOR: Human-like Scrolling Page ${currentPage}...`);
            await chrome.tabs.sendMessage(tabId, { action: "SCROLL_AND_PREPARE" }).catch(() => { });
            await sleep(getRandomDelay(3000, 6000));

            if (await isPaused(sessionId)) break;

            let screenshotData = null;
            if (session.settings && session.settings.saveScreenshots) {
                logToSession(sessionId, "📸 CAPTURING: Full page screenshot...");
                try { screenshotData = await captureFullPage(tabId); } catch (e) { logToSession(sessionId, "⚠️ SCREENSHOT FAILED."); }
            }

            if (await isPaused(sessionId)) break;
            
            logToSession(sessionId, "🔍 SCRAPING: Extracting data...");
            const response = await chrome.tabs.sendMessage(tabId, { action: "SCRAPE_SERP", payload: { startRank: collectedOrganic } }).catch(() => null);

            if (response && response.isCaptcha) {
                 await handleCaptchaEvent(sessionId, tabId);
                 return;
            }

            if (response && response.data) {
                const data = response.data;
                const newOrganic = data.organic.filter(r => !existingUrls.has(r.url));
                newOrganic.forEach(r => existingUrls.add(r.url));

                const remainingQuota = session.globalCount - collectedOrganic;
                const finalOrganicForPage = newOrganic.slice(0, Math.max(0, remainingQuota));
                data.organic = finalOrganicForPage;

                const aiFound = (data.ai_overview && data.ai_overview.found) ? "YES" : "NO";
                const adsCount = data.ads ? data.ads.length : 0;

                logToSession(sessionId, `📊 P${currentPage}: AI: ${aiFound} | Ads: ${adsCount} | New: ${finalOrganicForPage.length}`);

                let htmlToStore = null;
                if (session.settings && session.settings.saveHtml) {
                    htmlToStore = response.html_content;
                }

                await savePageContent(sessionId, nextIdx, currentPage, { html: htmlToStore, screenshot: screenshotData });
                currentTask.pages.push({ pageNumber: currentPage, results: data });
                
                collectedOrganic += finalOrganicForPage.length;
                currentTask.totalOrganic = collectedOrganic;

                await saveSession(session);

                if (collectedOrganic >= session.globalCount) {
                    logToSession(sessionId, `✅ TARGET MET: Collected ${collectedOrganic}.`);
                    break;
                }

                if (await isPaused(sessionId)) break;

                const nav = await chrome.tabs.sendMessage(tabId, { action: "NAVIGATE_NEXT" });
                
                if (nav && nav.isCaptcha) {
                    await handleCaptchaEvent(sessionId, tabId);
                    return;
                }

                if (!nav || !nav.success) {
                    logToSession(sessionId, "⏹️ END: No more search pages.");
                    break;
                }

                currentPage++;
                const wait = getRandomDelay(session.delays.min, session.delays.max);
                logToSession(sessionId, `😴 IDLE: Random wait ${Math.round(wait / 1000)}s...`);
                for (let i = 0; i < wait; i += 500) {
                    if (await isPaused(sessionId)) break;
                    await sleep(500);
                }
            } else { throw new Error("Scrape failed."); }
        }

        const finalCheck = await getSession(sessionId);
        if (finalCheck && finalCheck.status === "RUNNING") {
            currentTask.status = "DONE";
            await saveSession(session);
            logToSession(sessionId, `✔️ TASK COMPLETED: "${currentTask.term}"`);
        }

    } catch (error) {
        logToSession(sessionId, `❌ ERROR: ${error.message}`, "ERROR");
        await handleRetry(sessionId, currentTask, error.message);
    } finally {
        const check = await getSession(sessionId);
        if (tabId && (!check || check.status !== "PAUSED_CAPTCHA")) {
             await chrome.tabs.remove(tabId).catch(() => { });
        }
    }

    session = await getSession(sessionId);
    if (session && session.status === "RUNNING") {
        const cooldown = getRandomDelay(5000, 10000);
        logToSession(sessionId, `🍵 COOLDOWN: General break before next task (${Math.round(cooldown / 1000)}s)...`);
        setTimeout(() => processQueue(sessionId), cooldown);
    }
}

// --- 7. EXPORTS ---

async function exportFullBackup() {
    chrome.runtime.sendMessage({ type: "EXPORT_STARTED" });
    const sessions = await getAllSessions();
    const zip = new JSZip();
    zip.file("sessions_metadata.json", JSON.stringify(sessions));
    const resFolder = zip.folder("results");

    let count = 0;
    for (const sess of sessions) {
        for (let tIdx = 0; tIdx < sess.tasks.length; tIdx++) {
            for (const pg of sess.tasks[tIdx].pages) {
                const data = await getPageContent(sess.id, tIdx, pg.pageNumber);
                if (data) {
                    resFolder.file(`${sess.id}_${tIdx}_${pg.pageNumber}.json`, JSON.stringify(data));
                }
                if (++count % 10 === 0) await sleep(10);
            }
        }
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const downloadUrl = URL.createObjectURL(blob);
    chrome.downloads.download({ url: downloadUrl, filename: `RAT_FULL_BACKUP.zip` }, () => {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);
        chrome.runtime.sendMessage({ type: "EXPORT_FINISHED" });
    });
}

async function exportDataAsZip(sessionId) {
    chrome.runtime.sendMessage({ type: "EXPORT_STARTED" });
    await logToSession(sessionId, "🔨 Generierung des Exports gestartet. Bitte warten...");

    try {
        const session = await getSession(sessionId);
        const logs = await getLogs(sessionId);
        const zip = new JSZip();
        const imgFolder = zip.folder("screenshots");
        const htmlFolder = zip.folder("html");
        
        if (logs) {
            zip.file("activity_log.txt", logs.map(l => `[${l.ts}] [${l.level || 'INFO'}] ${l.msg}`).join("\n"));
        }

        let csv = "\uFEFFquery,engine,country,lang,page,type,rank,title,url,snippet,ai_full_text\n";
        const esc = (t) => t ? `"${String(t).replace(/"/g, '""')}"` : '""';

        let processCount = 0;
        for (let tIdx = 0; tIdx < session.tasks.length; tIdx++) {
            const q = session.tasks[tIdx];
            if (!q.pages || q.pages.length === 0) continue;
            
            const meta = `${esc(q.term)},${esc(q.config.engineName)},${esc(q.config.countryName)},${esc(q.config.langCode)}`;
            
            for (const p of q.pages) {
                const extra = await getPageContent(sessionId, tIdx, p.pageNumber);
                
                if (extra) {
                    if (extra.screenshot) {
                        imgFolder.file(`t${tIdx}_p${p.pageNumber}.jpg`, extra.screenshot.split(',')[1], { base64: true });
                    }
                    if (extra.html) {
                        htmlFolder.file(`t${tIdx}_p${p.pageNumber}.html`, extra.html);
                    }
                }

                if (p.results.ai_overview?.found) {
                    csv += `${meta},${p.pageNumber},ai_overview,1,AI Overview,,,${esc(p.results.ai_overview.text_full)}\n`;
                    p.results.ai_overview.sources.forEach((src, idx) => {
                        csv += `${meta},${p.pageNumber},ai_source,${idx + 1},${esc(src.title)},${esc(src.url)},,\n`;
                    });
                }

                p.results.organic.forEach(r => {
                    csv += `${meta},${p.pageNumber},organic,${r.rank},${esc(r.title)},${esc(r.url)},${esc(r.snippet)},\n`;
                });
                
                p.results.ads.forEach(ad => {
                    csv += `${meta},${p.pageNumber},ad,${ad.rank},${esc(ad.title)},${esc(ad.url)},${esc(ad.snippet)},\n`;
                });

                processCount++;
                if (processCount % 5 === 0) await sleep(50); 
            }
        }
        
        zip.file("rat_results.csv", csv);

        await logToSession(sessionId, "📦 ZIP-Datei wird finalisiert...");
        
        const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
            const base64data = reader.result;
            chrome.downloads.download({
                url: base64data,
                filename: `RAT_Export_${session.name.replace(/\W/g, '_')}.zip`,
                conflictAction: "uniquify",
                saveAs: true
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    logToSession(sessionId, "❌ Download-Fehler: " + chrome.runtime.lastError.message, "ERROR");
                } else {
                    logToSession(sessionId, "✅ Download erfolgreich gestartet!");
                }
                chrome.runtime.sendMessage({ type: "EXPORT_FINISHED" });
            });
        };

    } catch (err) {
        await logToSession(sessionId, "❌ Kritischer Fehler beim Export: " + err.message, "ERROR");
        chrome.runtime.sendMessage({ type: "EXPORT_FINISHED" });
    }
}

// --- 8. UTILS ---
function buildSearchUrl(term, conf) {
    const q = encodeURIComponent(term);
    const domain = conf.domain || "www.google.com";
    const gl = conf.countryCode || "us";
    let u = `https://${domain}/search?q=${q}&gl=${gl}`;
    if (conf.langCode) u += `&hl=${conf.langCode}`;
    if (conf.location) u += `&uule=${generateUule(conf.location)}`;
    return u;
}

function generateUule(loc) {
    const secret = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    return `w+CAIQICI${secret[loc.length % 65]}${btoa(loc)}`;
}

async function captureFullPage(tabId) {
    return new Promise((resolve, reject) => {
        chrome.debugger.attach({ tabId }, "1.3", () => {
            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
            chrome.tabs.sendMessage(tabId, { action: "GET_DIMENSIONS" }, (m) => {
                if (!m) {
                    chrome.debugger.detach({ tabId });
                    return reject("No metrics");
                }
                chrome.debugger.sendCommand({ tabId }, "Page.captureScreenshot", { format: "jpeg", quality: 50, fromSurface: true, captureBeyondViewport: true }, (res) => {
                    chrome.debugger.detach({ tabId });
                    if (res?.data) resolve("data:image/jpeg;base64," + res.data);
                    else reject("No image");
                });
            });
        });
    });
}

function waitForTabSmart(tabId) {
    return new Promise(r => {
        chrome.tabs.get(tabId, t => {
            if (t.status === 'complete') r();
            else {
                const l = (id, chg) => {
                    if (id === tabId && chg.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(l);
                        r();
                    }
                };
                chrome.tabs.onUpdated.addListener(l);
            }
        });
    });
}

async function handleRetry(sessionId, task, errorMsg) {
    if (await isPaused(sessionId)) return;
    task.retryCount++;
    if (task.retryCount > 3) {
        task.status = "FAILED";
        logToSession(sessionId, `💀 FAILED: Abandoning after 3 retries.`);
    } else {
        logToSession(sessionId, `⚠️ RETRY ${task.retryCount}/3 in 5s...`);
        task.status = "OPEN";
        await sleep(5000);
    }
}

async function broadcastSessionList() {
    const sessions = await getAllSessions();
    const list = sessions.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        progress: {
            done: s.tasks.filter(t => t.status === "DONE").length,
            total: s.tasks.length
        }
    }));
    chrome.runtime.sendMessage({ type: "SESSION_LIST", payload: list }).catch(() => { });
}

async function broadcastSessionStatus(id) {
    const s = await getSession(id);
    if (!s) return;
    const logs = await getLogs(id);
    const current = s.tasks[s.currentIndex];
    chrome.runtime.sendMessage({
        type: "SESSION_STATUS",
        payload: {
            sessionId: id,
            name: s.name,
            status: s.status,
            progress: {
                done: s.tasks.filter(t => t.status === "DONE").length,
                total: s.tasks.length
            },
            currentQuery: current ? current.term : "Done",
            logs: logs || [],
            delays: s.delays,
            originalConfigs: s.originalConfigs,
            originalQueries: s.originalQueries,
            settings: s.settings,
            globalCount: s.globalCount // NEW
        }
    }).catch(() => { });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function importFullBackup(file) {
    const zip = await JSZip.loadAsync(file);
    const metaStr = await zip.file("sessions_metadata.json").async("string");
    const sessions = JSON.parse(metaStr);
    const tx = db.transaction([STORE_SESSIONS, STORE_RESULTS], "readwrite");
    sessions.forEach(s => tx.objectStore(STORE_SESSIONS).put(s));
    const resFiles = zip.folder("results").file(/.*\.json$/);
    for (const f of resFiles) {
        const content = JSON.parse(await f.async("string"));
        const key = f.name.replace("results/", "").replace(".json", "");
        tx.objectStore(STORE_RESULTS).put(content, key);
    }
    await new Promise(r => tx.oncomplete = r);
    broadcastSessionList();
}

async function updateSessionDelay(payload) {
    const s = await getSession(payload.sessionId);
    if (s) {
        s.delays = { min: payload.min * 1000, max: payload.max * 1000 };
        await saveSession(s);
        logToSession(payload.sessionId, `⏱️ Delay updated to ${payload.min}-${payload.max}s`);
        broadcastSessionStatus(payload.sessionId);
    }
}

// --- NEW: LIMIT UPDATE ---
async function updateSessionLimit(payload) {
    const s = await getSession(payload.sessionId);
    if (s) {
        s.globalCount = parseInt(payload.limit);
        await saveSession(s);
        logToSession(payload.sessionId, `🎯 Target Results updated to ${s.globalCount}`);
        broadcastSessionStatus(payload.sessionId);
    }
}