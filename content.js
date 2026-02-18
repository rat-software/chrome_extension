// content.js - Version 16.0 (No LLM, Enhanced Humanizing)

if (!window.ratListenerAdded) {
    window.ratListenerAdded = true;

    // --- CAPTCHA DETECTION ---
    function isCaptchaPage() {
        const title = document.title.toLowerCase();
        const bodyText = document.body.innerText.toLowerCase();
        
        const hasCaptchaForm = document.querySelector('form[action*="Captcha"]') !== null;
        const hasRecaptcha = document.querySelector('.g-recaptcha, #recaptcha') !== null;
        const unusualTraffic = bodyText.includes('unusual traffic') || bodyText.includes('ungewöhnlicher datenverkehr');
        const robotCheck = bodyText.includes('not a robot') || bodyText.includes('kein roboter');

        if ((hasCaptchaForm || hasRecaptcha) && (unusualTraffic || robotCheck)) {
            if (!window.captchaAlreadyLogged) {
                 console.warn("🤖 RAT: CAPTCHA DETECTED! Stopping all automated requests.");
                 window.captchaAlreadyLogged = true;
            }
            return true;
        }
        
        if (title.includes("sorry") && unusualTraffic) {
            return true;
        }
        
        return false;
    }

    const SELECTORS = {
        mainCol: '#rso',
        organicContainer: '.tF2Cxc, .g',
        ads: '[data-text-ad="1"], .uEierd, .vdQmEd',
        organicHeader: 'h3',
        nextId: '#pnnext',
        navRole: '[role="navigation"]',
        aiContainerPy: '.LT6XE',
        aiSourceItem: '.LLtSOc, .CyMdWb, .LT6XE [role="listitem"]',
        aiSourceLinkPy: 'a.KEVENd, a.NDNGvf',
        aiSourceTitlePy: '.mNme1d, .Nn35F',
        paaContainer: '.related-question-pair, .wQiwMc, [jsname="yEVEwb"]'
    };

    const KEYWORDS = {
        SHOW_MORE: ["Mehr anzeigen", "Show more", "Mostrar más", "Afficher plus", "Mostra altro", "Meer weergeven", "Mostrar mais"],
        SHOW_ALL: ["Alle anzeigen", "Show all", "Ver todo", "Tout afficher", "Visualizza tutto", "Alles weergeven", "Ver tudo"],
        GENERIC: ["ähnliche", "view related", "quellen", "sources", "weitere", "more", "fuentes", "fonti", "bronnen"]
    };

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === "SCROLL_AND_PREPARE") {
            if (isCaptchaPage()) {
                sendResponse({ success: false, isCaptcha: true });
            } else {
                performHumanActions().then(() => sendResponse({ success: true, isCaptcha: false }));
            }
            return true;
        }
        
        if (msg.action === "SCRAPE_SERP") {
            if (isCaptchaPage()) {
                sendResponse({ success: false, isCaptcha: true, data: null });
            } else {
                const data = scrapeData();
                sendResponse({ success: true, isCaptcha: false, data: data, html_content: document.documentElement.outerHTML });
            }
            return true;
        }
        
        if (msg.action === "NAVIGATE_NEXT") {
            if (isCaptchaPage()) {
                sendResponse({ success: false, isCaptcha: true });
            } else {
                navigateToNext().then(sendResponse);
            }
            return true;
        }
        
        if (msg.action === "GET_DIMENSIONS") {
            sendResponse({
                width: document.documentElement.scrollWidth,
                height: document.documentElement.scrollHeight,
                deviceScaleFactor: window.devicePixelRatio
            });
            return true;
        }
        
        if (msg.action === "CHECK_CAPTCHA") {
            sendResponse({ isCaptcha: isCaptchaPage() });
            return true;
        }
    });

    // --- ENHANCED HUMAN ACTIONS ---
    async function performHumanActions() {
        console.log("🤖 RAT: Starting Enhanced Human Sequence...");

        if (!handleCookieConsent()) {
            await wait(800);
            handleCookieConsent();
        }
        
        for (let i = 0; i < 2; i++) {
            if (handleGooglePopups()) {
                await wait(1500);
                break;
            }
            await wait(300);
        }

        const focusable = document.querySelectorAll('a, h3, .g');
        for (let i = 0; i < 3; i++) {
            const el = focusable[Math.floor(Math.random() * focusable.length)];
            if (el) {
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                await wait(Math.random() * 200 + 100);
            }
        }

        const totalHeight = () => document.body.scrollHeight;
        let currentY = 0;
        
        while (currentY < totalHeight()) {
            const step = Math.floor(Math.random() * 250) + 100;
            currentY += step;
            window.scrollTo({ top: currentY, behavior: 'smooth' }); 
            
            await wait(Math.floor(Math.random() * 300) + 100);

            if (Math.random() > 0.7) { 
                const backStep = Math.floor(Math.random() * 100) + 50;
                currentY -= backStep;
                if (currentY < 0) currentY = 0;
                window.scrollTo({ top: currentY, behavior: 'smooth' });
                await wait(Math.floor(Math.random() * 1000) + 500);
            }

            if ((window.innerHeight + window.scrollY) >= totalHeight() - 50) break;
        }

        await wait(1200);
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
        await wait(1500);

        await interactWithAI();
    }

    async function interactWithAI() {
        await wait(1000);

        function findButtonByKeywords(keywordList) {
            const allButtons = document.querySelectorAll('div[role="button"], button, span[role="button"]');
            for (const button of allButtons) {
                if (button.offsetParent === null) continue;
                const text = (button.innerText || "").toLowerCase().trim();
                const label = (button.getAttribute("aria-label") || "").toLowerCase().trim();
                const matches = keywordList.some(kw => text.includes(kw.toLowerCase()) || label.includes(kw.toLowerCase()));
                
                if (matches) {
                    if (button.closest(SELECTORS.aiContainerPy) || button.closest('.iDjcJe') || button.closest('.bTFeG')) {
                        return button;
                    }
                }
            }
            return null;
        }

        let targetButton_1 = findButtonByKeywords(KEYWORDS.SHOW_MORE);
        if (!targetButton_1) targetButton_1 = document.querySelector('.in7vHe[role="button"]');

        if (targetButton_1) {
            try {
                targetButton_1.scrollIntoView({ block: "center" });
                await wait(600);
                targetButton_1.click();
                await wait(2500);
            } catch (e) { }
        }
        
        if (Math.random() > 0.5) { 
            let targetButton_2 = findButtonByKeywords(KEYWORDS.SHOW_ALL);
            if (targetButton_2) {
                try {
                    targetButton_2.scrollIntoView({ block: "center" });
                    await wait(600);
                    targetButton_2.click();
                    await wait(2500);
                } catch (e) { }
            }
        }
    }

    function scrapeData() {
        const result = {
            organic: [],
            ads: [],
            ai_overview: { found: false, text_full: "", sources: [] }
        };

        const urlParams = new URLSearchParams(window.location.search);
        const currentQuery = urlParams.get('q') || "";
        const isFirstPage = !urlParams.get('start') || urlParams.get('start') === '0';
        let rankOffset = 0;

        const STORAGE_KEY_QUERY = "rat_last_query";
        const STORAGE_KEY_COUNT = "rat_organic_count";
        const lastQuery = sessionStorage.getItem(STORAGE_KEY_QUERY);

        if (currentQuery !== lastQuery || isFirstPage) {
            sessionStorage.setItem(STORAGE_KEY_QUERY, currentQuery);
            sessionStorage.setItem(STORAGE_KEY_COUNT, "0");
            rankOffset = 0;
        } else {
            const storedCount = sessionStorage.getItem(STORAGE_KEY_COUNT);
            if (storedCount) rankOffset = parseInt(storedCount, 10);
        }

        const aiContainerGlobal = document.querySelector(SELECTORS.aiContainerPy);
        let sourceItems = Array.from(document.querySelectorAll(SELECTORS.aiSourceItem));

        if (sourceItems.length === 0 && aiContainerGlobal) {
            const allLinks = aiContainerGlobal.querySelectorAll('a');
            sourceItems = Array.from(allLinks).filter(a => {
                const href = a.href || "";
                return href.startsWith('http') && !href.includes('google.com/search') && !href.includes('googleadservices');
            });
        }

        if (aiContainerGlobal || sourceItems.length > 0) {
            let cleanText = "";
            if (aiContainerGlobal) {
                const clone = aiContainerGlobal.cloneNode(true);
                
                const sourceContainers = clone.querySelectorAll('.wDa0n, .MFrAxb, .bTFeG, .Q2WBBe, .agYtEe, .fG8Fp');
                sourceContainers.forEach(el => el.remove());

                clone.querySelectorAll('[role="button"], button').forEach(btn => btn.remove());
                clone.querySelectorAll('script, style, noscript, svg, img, iframe').forEach(e => e.remove());

                clone.querySelectorAll('li').forEach(li => {
                    const txt = li.innerText.trim();
                    if (txt.length > 0) {
                        li.prepend(document.createTextNode(" - "));
                        li.append(document.createTextNode("\r\n"));
                    } else {
                        li.remove();
                    }
                });

                clone.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
                    h.prepend(document.createTextNode("\r\n\r\n\r\n"));
                });

                clone.querySelectorAll('p').forEach(p => {
                    p.append(document.createTextNode("\r\n"));
                });
                
                cleanText = clone.innerText; 
                cleanText = cleanText.replace(/\r\n|\r|\n/g, '\r\n');
                
                cleanText = cleanText.replace(/^[\s]*-\s*$/gm, '');
                cleanText = cleanText.replace(/(\r\n){4,}/g, '\r\n\r\n\r\n').trim();

                const allKeywords = [...KEYWORDS.SHOW_MORE, ...KEYWORDS.SHOW_ALL, ...KEYWORDS.GENERIC];
                allKeywords.forEach(kw => {
                    if (cleanText.toLowerCase().startsWith(kw.toLowerCase())) {
                        cleanText = cleanText.substring(kw.length).trim();
                    }
                });
            }

            const sourcesData = [];
            const uniqueUrls = new Set();

            sourceItems.forEach(el => {
                if (el.closest(SELECTORS.paaContainer)) return;

                let linkEl = el.querySelector(SELECTORS.aiSourceLinkPy);
                if (!linkEl && el.tagName === 'A') linkEl = el;
                if (!linkEl) linkEl = el.querySelector('a');

                if (!linkEl) return;

                const href = linkEl.href;
                if (!href || href.includes('google.com/search') || uniqueUrls.has(href)) return;
                uniqueUrls.add(href);

                let title = "";
                const titleEl = el.querySelector(SELECTORS.aiSourceTitlePy);
                if (titleEl) title = titleEl.innerText.trim();
                if (!title) title = linkEl.getAttribute('aria-label');
                if (!title) title = linkEl.innerText.trim();
                if (!title || title.length < 2) {
                    try { title = new URL(href).hostname; } catch (e) { title = "Source"; }
                }

                sourcesData.push({ title: title, url: href });
            });

            if (cleanText || sourcesData.length > 0) {
                result.ai_overview = { found: true, text_full: cleanText, sources: sourcesData };
            }
        }

        const rso = document.querySelector(SELECTORS.mainCol);
        if (rso) {
            let items = rso.querySelectorAll(SELECTORS.organicContainer);
            if (items.length === 0) items = Array.from(rso.children);

            for (let item of items) {
                if (item.offsetHeight === 0 || !item.innerText.trim()) continue;

                if (item.matches(SELECTORS.ads) || item.querySelector(SELECTORS.ads)) {
                    extractAd(item, result.ads);
                    continue;
                }

                const organicHeader = item.querySelector(SELECTORS.organicHeader) || item.querySelector('h3');
                if (organicHeader) {
                    if (item.innerHTML.includes('related-question-pair')) continue;
                    const link = organicHeader.closest('a');
                    if (link && !link.href.includes('google.com/search')) {
                        if (item.classList.contains('LT6XE') || item.querySelector('.LT6XE')) continue;
                        extractOrganic(item, link, result.organic, rankOffset);
                    }
                }
            }
        }
        
        const newTotalCount = rankOffset + result.organic.length;
        sessionStorage.setItem(STORAGE_KEY_COUNT, newTotalCount.toString());
        return result;
    }

    function extractOrganic(container, link, list, offset) {
        const h3 = link.querySelector('h3');
        const title = h3 ? h3.innerText.trim() : link.innerText.trim();
        let snippet = "";
        const blocks = container.querySelectorAll('div, span');
        for (let b of blocks) {
            if (b.innerText.length > 40 && !b.innerText.includes(title) && !b.closest('h3') && !b.closest('a')) {
                if (!b.innerText.startsWith('http')) {
                    snippet = b.innerText;
                    break;
                }
            }
        }
        list.push({
            rank: offset + list.length + 1,
            title: title,
            url: link.href,
            snippet: snippet.trim()
        });
    }

    function extractAd(container, list) {
        const link = container.querySelector('a');
        if (!link) return;
        const h3 = container.querySelector('[role="heading"], h3');
        let text = container.innerText.substring(0, 300).replace(/\n/g, " ");
        list.push({
            rank: list.length + 1,
            title: h3 ? h3.innerText : "Ad",
            url: link.href,
            snippet: text
        });
    }

    async function navigateToNext() {
        let nextBtn = document.querySelector(SELECTORS.nextId);
        
        if (!nextBtn) {
            const match = window.location.href.match(/start=(\d+)/);
            let nextStart = 10;
            if (match) nextStart = parseInt(match[1]) + 10;
            nextBtn = document.querySelector(`a[href*="start=${nextStart}"]`);
        }

        if (nextBtn) {
            nextBtn.scrollIntoView({ block: "center", behavior: "smooth" });
            await wait(1000); 
            nextBtn.click();
            return { success: true };
        }
        return { success: false };
    }

    function wait(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function handleCookieConsent() {
        const accept = document.getElementById('L2AGLb');
        const reject = document.getElementById('W0wltc');
        const btn = accept || reject;
        if (btn) {
            btn.click();
            return true;
        }
        return false;
    }

    function handleGooglePopups() {
        const keywords = [
            "ok", "confirm", "accept", "agree", "continue", "not now", "no thanks", "later", "reject",
            "bestätigen", "ich bin über 18", "akzeptieren", "zustimmen", "fortfahren", "nicht jetzt", "nein danke", "später", "ablehnen",
            "confirmar", "soy mayor de 18", "aceptar", "continuar", "ahora no", "no gracias", "más tarde",
            "confirmer", "accepter", "continuer", "pas maintenant", "non merci", "plus tard",
            "conferma", "accetta", "continua", "non ora", "no grazie", "più tardi",
            "confirmar", "aceitar", "continuar", "agora não", "nicht danke", "mais tarde",
            "bevestigen", "accepteren", "doorgaan", "niet nu", "nee bedankt", "later"
        ];
        
        const dialogs = document.querySelectorAll('.mcPPZ, .qk7LXc, minor-moment-dialog, [role="dialog"]');

        for (const dlg of dialogs) {
            if (dlg.offsetParent === null) continue; 
            const buttons = dlg.querySelectorAll('g-raised-button, button, [role="button"], .M9Bg4d');
            for (const btn of buttons) {
                const text = (btn.innerText || "").toLowerCase().trim();
                const match = keywords.some(k => {
                    if (k.length < 4) return text === k; 
                    return text.includes(k);
                });
                if (match) {
                    try {
                        btn.click(); 
                        return true; 
                    } catch(e) {}
                }
            }
        }
        return false;
    }
}