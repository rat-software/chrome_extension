/**
 * @file content.js - Version 1.0
 * Content script for the Result Assessment Tool (RAT).
 * Injected into Search Engine Result Pages (SERPs) to automate interactions,
 * detect bot-protections (CAPTCHAs), and extract structured search data.
 * Supports: Google and Bing.
 */

if (!window.ratListenerAdded) {
    /** Prevent multiple injections of the listener on the same page. */
    window.ratListenerAdded = true;

    // --- ENGINE DETECTION ---
    /** @type {boolean} Flag indicating if the current host is Bing. */
    const isBing = window.location.hostname.includes('bing.com');

    // --- CAPTCHA DETECTION ---
    /**
     * Scans the DOM for common indicators of bot detection or CAPTCHA walls.
     * @returns {boolean} True if a bot-block is detected.
     */
    function isCaptchaPage() {
        const title = document.title.toLowerCase();
        const bodyText = document.body.innerText.toLowerCase();
        
        // Check for Google-specific CAPTCHA forms and traffic warnings
        const hasCaptchaForm = document.querySelector('form[action*="Captcha"]') !== null;
        const unusualTraffic = bodyText.includes('unusual traffic') || bodyText.includes('ungewöhnlicher datenverkehr');
        const robotCheck = bodyText.includes('not a robot') || bodyText.includes('kein roboter');
        
        // Generic ReCaptcha check (covers Bing and Google)
        const hasRecaptcha = document.querySelector('.g-recaptcha, #recaptcha, iframe[src*="recaptcha"]') !== null;

        if ((hasCaptchaForm || hasRecaptcha) && (unusualTraffic || robotCheck || isBing)) {
            if (!window.captchaAlreadyLogged) {
                 console.warn("🤖 RAT: CAPTCHA DETECTED! Stopping all automated requests.");
                 window.captchaAlreadyLogged = true;
            }
            return true;
        }
        
        // Handle Google "Sorry" page redirects
        if (title.includes("sorry") && unusualTraffic) return true;
        return false;
    }

    // --- GOOGLE SELECTORS ---
    /** * CSS Selectors for Google SERP elements. 
     * Includes Organic results, Ads, AI Overviews (SGE), and Pagination.
     */
    const GOOGLE = {
        mainCol: '#rso',
        organicContainer: '.tF2Cxc, .g',
        ads: '[data-text-ad="1"], .uEierd, .vdQmEd',
        organicHeader: 'h3',
        nextId: '#pnnext',
        aiContainerPy: '.LT6XE',
        aiSourceItem: '.LLtSOc, .CyMdWb, .LT6XE [role="listitem"]',
        aiSourceLinkPy: 'a.KEVENd, a.NDNGvf',
        aiSourceTitlePy: '.mNme1d, .Nn35F',
        paaContainer: '.related-question-pair, .wQiwMc, [jsname="yEVEwb"]'
    };

    // --- BING SELECTORS ---
    /** * CSS Selectors for Bing SERP elements. 
     * Includes Organic results, Ads, AI Overview, and Pagination.
     */
    const BING = {
        mainCol: '#b_results',
        organicContainer: 'li.b_algo, li.b_algo_group',
        ads: 'li.b_ad',
        organicHeader: 'h2 a, a.tilk',
        nextId: 'a.sb_pagN, a[title="Nächste Seite"], a[title="Page suivante"], a[title="Pagina successiva"], a[title="Next page"]',
        aiContainer: 'div.gs_h.gs_caphead',
        aiText: '.gs_text',
        aiSourceItem_type1: '.gs_cit',
        aiSourceItem_type2: '.hov-item',
        cookieBtn: '#bnp_btn_accept, .bnp_btn_accept'
    };

    /** Keywords used to identify expansion buttons for AI overviews across different languages. */
    const KEYWORDS = {
        SHOW_MORE: ["Mehr anzeigen", "Show more", "Mostrar más", "Afficher plus", "Mostra altro", "Meer weergeven", "Mostrar mais", "Mehr Quellen"],
        SHOW_ALL: ["Alle anzeigen", "Show all", "Ver todo", "Tout afficher", "Visualizza tutto", "Alles weergeven", "Ver tudo"],
        GENERIC: ["ähnliche", "view related", "quellen", "sources", "weitere", "more", "fuentes", "fonti", "bronnen"]
    };

    // --- MESSAGE LISTENER ---
    /** * Primary communication interface with the Background Service Worker.
     */
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        /** Sequence 1: Prepare page for scraping (Handle consents, Human-like scrolling). */
        if (msg.action === "SCROLL_AND_PREPARE") {
            if (isCaptchaPage()) sendResponse({ success: false, isCaptcha: true });
            else performHumanActions().then(() => sendResponse({ success: true, isCaptcha: false }));
            return true;
        }
        
        /** Sequence 2: Scrape structured data and the raw HTML source. */
        if (msg.action === "SCRAPE_SERP") {
            if (isCaptchaPage()) sendResponse({ success: false, isCaptcha: true, data: null });
            else {
                const data = isBing ? scrapeBingData() : scrapeGoogleData();
                sendResponse({ success: true, isCaptcha: false, data: data, html_content: document.documentElement.outerHTML });
            }
            return true;
        }
        
        /** Sequence 3: Trigger navigation to the next result page. */
        if (msg.action === "NAVIGATE_NEXT") {
            if (isCaptchaPage()) sendResponse({ success: false, isCaptcha: true });
            else navigateToNext().then(sendResponse);
            return true;
        }
        
        /** Utility: Returns window/document dimensions for screenshot processing. */
        if (msg.action === "GET_DIMENSIONS") {
            
            // --- NEW: Neutralize sticky headers to prevent screenshot duplication ---
            const style = document.createElement('style');
            style.innerHTML = `
                #searchform, .sfbg, header, #b_header, .b_searchboxForm, 
                [style*="position: fixed"], [style*="position: sticky"], 
                .LHJvCe, .yg51vc, .t2051c {
                    position: absolute !important;
                }
            `;
            document.head.appendChild(style);
            
            // Force a layout recalculation so the browser applies the CSS instantly
            void document.documentElement.offsetHeight;
            // ------------------------------------------------------------------------

            sendResponse({ 
                width: document.documentElement.scrollWidth, 
                height: document.documentElement.scrollHeight, 
                deviceScaleFactor: window.devicePixelRatio 
            });
            return true;
        }
        /** Internal check to report captcha status without triggering actions. */
        if (msg.action === "CHECK_CAPTCHA") {
            sendResponse({ isCaptcha: isCaptchaPage() });
            return true;
        }
    });

    // --- ENHANCED HUMAN ACTIONS ---
    /**
     * Orchestrates a sequence of actions designed to simulate a real human user.
     * Includes cookie handling, popup management, random mouse movements, and non-linear scrolling.
     */
    async function performHumanActions() {
        console.log(`🤖 RAT: Starting Enhanced Human Sequence on ${isBing ? 'Bing' : 'Google'}...`);

        // Handle cookie consent banners immediately or after a short delay
        if (!handleCookieConsent()) {
            await wait(800);
            handleCookieConsent();
        }
        
        // Handle Google-specific popups (like "Stay signed out")
        if (!isBing) {
            for (let i = 0; i < 2; i++) {
                if (handleGooglePopups()) { await wait(1500); break; }
                await wait(300);
            }
        }

        // Simulates human "skimming" by hovering over various focusable elements
        const focusable = document.querySelectorAll('a, h3, h2, .g, .b_algo');
        for (let i = 0; i < 3; i++) {
            const el = focusable[Math.floor(Math.random() * focusable.length)];
            if (el) { el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); await wait(Math.random() * 200 + 100); }
        }

        // Non-linear human-like scrolling down the page
        const totalHeight = () => document.body.scrollHeight;
        let currentY = 0;
        
        while (currentY < totalHeight()) {
            const step = Math.floor(Math.random() * 250) + 100;
            currentY += step;
            window.scrollTo({ top: currentY, behavior: 'smooth' }); 
            await wait(Math.floor(Math.random() * 300) + 100);

            // Occasional upward scrolling to simulate re-reading content
            if (Math.random() > 0.7) { 
                const backStep = Math.floor(Math.random() * 100) + 50;
                currentY -= backStep;
                if (currentY < 0) currentY = 0;
                window.scrollTo({ top: currentY, behavior: 'smooth' });
                await wait(Math.floor(Math.random() * 1000) + 500);
            }
            if ((window.innerHeight + window.scrollY) >= totalHeight() - 50) break;
        }

        // Return to top before expanding AI content
        await wait(1200);
        window.scrollTo({ top: 0, behavior: 'smooth' }); 
        await wait(1500);

        await interactWithAI();
    }

    /**
     * Attempts to expand AI Overviews (SGE or Bing Chat) to reveal full text and sources.
     */
    async function interactWithAI() {
        await wait(1000);
        
        /** Helper for safe event dispatching to avoid Content Security Policy (CSP) issues. */
        function safeClick(element) {
            if (element) {
                element.dispatchEvent(new MouseEvent('click', { 
                    bubbles: true, 
                    cancelable: true, 
                    view: window 
                }));
            }
        }

        if (isBing) {
            // Locate Bing "Read More" and "Sources" expansion buttons
            const readMore = document.querySelector('.gs_readMoreFullBtn');
            if (readMore && readMore.offsetHeight > 0) {
                safeClick(readMore); 
                await wait(1500);
            }
            const expSources = document.querySelector('.cit_exp_btn');
            if (expSources && expSources.offsetHeight > 0) {
                safeClick(expSources); 
                await wait(1500);
            }
        } else {
            // Locate Google "Show More" button for AI Overviews
            const allButtons = document.querySelectorAll('div[role="button"], button, span[role="button"]');
            let targetBtn = Array.from(allButtons).find(b => {
                if (b.offsetParent === null) return false;
                const txt = (b.innerText || "").toLowerCase() + (b.getAttribute("aria-label") || "").toLowerCase();
                return KEYWORDS.SHOW_MORE.some(kw => txt.includes(kw.toLowerCase())) && (b.closest(GOOGLE.aiContainerPy) || b.closest('.iDjcJe'));
            });
            if (!targetBtn) targetBtn = document.querySelector('.in7vHe[role="button"]');
            
            if (targetBtn) {
                targetBtn.scrollIntoView({ block: "center" }); 
                await wait(600);
                safeClick(targetBtn); 
                await wait(2500);
            }
        }
    }

    // --- UTILS ---
    /** Simple promise wrapper for setTimeout. */
    function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

    /**
     * Decodes Bing's URL redirection parameters into a clean destination URL.
     * @param {string} url - The raw Bing redirect URL.
     * @returns {string} The decoded destination URL.
     */
    function decodeBingUrl(url) {
        if (!url) return "N/A";
        try {
            let urlObj = new URL(url);
            let uParam = urlObj.searchParams.get('u');
            if (uParam && uParam.startsWith('a1')) {
                let base64str = uParam.substring(2);
                while (base64str.length % 4 !== 0) base64str += '=';
                base64str = base64str.replace(/-/g, '+').replace(/_/g, '/');
                return decodeURIComponent(escape(atob(base64str)));
            }
        } catch(e) {}
        return url;
    }

    /**
     * Manages ranking synchronization across multiple search pages.
     * Uses sessionStorage to track how many organic results have been processed for the current query.
     * @returns {number} The starting rank index for the current page.
     */
    function initRankOffset() {
        const urlParams = new URLSearchParams(window.location.search);
        const currentQuery = urlParams.get('q') || "";
        const isFirstPage = (!urlParams.get('start') || urlParams.get('start') === '0') && (!urlParams.get('first') || urlParams.get('first') === '1');
        
        const STORAGE_KEY_QUERY = "rat_last_query";
        const STORAGE_KEY_COUNT = "rat_organic_count";
        const lastQuery = sessionStorage.getItem(STORAGE_KEY_QUERY);

        let rankOffset = 0;
        if (currentQuery !== lastQuery || isFirstPage) {
            sessionStorage.setItem(STORAGE_KEY_QUERY, currentQuery);
            sessionStorage.setItem(STORAGE_KEY_COUNT, "0");
        } else {
            const storedCount = sessionStorage.getItem(STORAGE_KEY_COUNT);
            if (storedCount) rankOffset = parseInt(storedCount, 10);
        }
        return rankOffset;
    }

    // --- GOOGLE SCRAPER ---
    /**
     * Extracts structured data from a Google SERP.
     * @returns {Object} Extracted data including Organic results, Ads, and AI content.
     */
    function scrapeGoogleData() {
        const result = { organic: [], ads: [], ai_overview: { found: false, text_full: "", sources: [] } };
        let rankOffset = initRankOffset();

        // 1. Process AI Overviews (SGE)
        const aiContainerGlobal = document.querySelector(GOOGLE.aiContainerPy);
        let sourceItems = Array.from(document.querySelectorAll(GOOGLE.aiSourceItem));

        if (aiContainerGlobal || sourceItems.length > 0) {
            let cleanText = "";
            if (aiContainerGlobal) {
                // Clone the container to clean interactive elements from the text output
                const clone = aiContainerGlobal.cloneNode(true);
                clone.querySelectorAll('.wDa0n, .MFrAxb, .bTFeG, .Q2WBBe, .agYtEe, .fG8Fp, [role="button"], button, script, style, svg, img').forEach(el => el.remove());
                cleanText = clone.innerText.replace(/\r\n|\r|\n/g, '\r\n').replace(/(\r\n){4,}/g, '\r\n\r\n\r\n').trim();
            }

            const uniqueUrls = new Set();
            sourceItems.forEach(el => {
                // Ignore "People Also Ask" items that appear in source lists
                if (el.closest(GOOGLE.paaContainer)) return;
                let linkEl = el.querySelector(GOOGLE.aiSourceLinkPy) || (el.tagName === 'A' ? el : el.querySelector('a'));
                if (!linkEl || linkEl.href.includes('google.com/search') || uniqueUrls.has(linkEl.href)) return;
                uniqueUrls.add(linkEl.href);

                let titleEl = el.querySelector(GOOGLE.aiSourceTitlePy);
                let title = titleEl ? titleEl.innerText.trim() : (linkEl.getAttribute('aria-label') || linkEl.innerText.trim());
                result.ai_overview.sources.push({ title: title || "Source", url: linkEl.href });
            });

            if (cleanText || result.ai_overview.sources.length > 0) {
                result.ai_overview.found = true;
                result.ai_overview.text_full = cleanText;
            }
        }

        // 2. Process Organic Results and Ads
        const rso = document.querySelector(GOOGLE.mainCol);
        if (rso) {
            let items = rso.querySelectorAll(GOOGLE.organicContainer);
            if (items.length === 0) items = Array.from(rso.children);

            for (let item of items) {
                if (item.offsetHeight === 0 || !item.innerText.trim()) continue;
                
                // Detection for Ads
                if (item.matches(GOOGLE.ads) || item.querySelector(GOOGLE.ads)) {
                    const link = item.querySelector('a');
                    const h3 = item.querySelector('[role="heading"], h3');
                    if (link) result.ads.push({ rank: result.ads.length + 1, title: h3 ? h3.innerText : "Ad", url: link.href, snippet: item.innerText.substring(0, 200).replace(/\n/g, " ") });
                    continue;
                }
                
                // Detection for Organic results
                const organicHeader = item.querySelector(GOOGLE.organicHeader) || item.querySelector('h3');
                if (organicHeader && !item.innerHTML.includes('related-question-pair')) {
                    const link = organicHeader.closest('a');
                    if (link && !link.href.includes('google.com/search')) {
                        const title = organicHeader.innerText.trim();
                        let snippet = "";
                        const blocks = item.querySelectorAll('div, span');
                        for (let b of blocks) {
                            if (b.innerText.length > 40 && !b.innerText.includes(title) && !b.closest('h3')) { snippet = b.innerText; break; }
                        }
                        result.organic.push({ rank: rankOffset + result.organic.length + 1, title: title, url: link.href, snippet: snippet.trim() });
                    }
                }
            }
        }
        sessionStorage.setItem("rat_organic_count", (rankOffset + result.organic.length).toString());
        return result;
    }

    // --- BING SCRAPER ---
    /**
     * Extracts structured data from a Bing SERP.
     * @returns {Object} Extracted data including Organic results, Ads, and AI Chat content.
     */
    function scrapeBingData() {
        const result = { organic: [], ads: [], ai_overview: { found: false, text_full: "", sources: [] } };
        let rankOffset = initRankOffset();

        // 1. Process Bing AI Overview
        const aiContainer = document.querySelector(BING.aiContainer);
        if (aiContainer) {
            let textContainer = aiContainer.querySelector(BING.aiText) || aiContainer;
            let rawText = textContainer.innerText;
            
            // Clean noise from AI Text output
            let urlStartIdx = rawText.indexOf("www.");
            if (urlStartIdx !== -1) rawText = rawText.substring(0, urlStartIdx);
            rawText = rawText.replace(/^(Bilder\s*|Videos\s*)+/g, '').trim();

            const sources = [];
            const uniqueUrls = new Set();
            
            // Extract sources using Bing's multiple citation formats (Type 1 & 2)
            document.querySelectorAll(BING.aiSourceItem_type1).forEach(el => {
                let url = decodeBingUrl(el.getAttribute('data-url') || '');
                if (url && url !== "N/A" && !uniqueUrls.has(url)) {
                    sources.push({ title: el.getAttribute('data-title') || "Source", url: url });
                    uniqueUrls.add(url);
                }
            });
            document.querySelectorAll(BING.aiSourceItem_type2).forEach(el => {
                let a = el.closest('a') || el;
                let url = decodeBingUrl(a.href);
                let titleDiv = el.querySelector('.hov-item-ttl');
                if (url && url !== "N/A" && !uniqueUrls.has(url)) {
                    sources.push({ title: titleDiv ? titleDiv.innerText.trim() : "Source", url: url });
                    uniqueUrls.add(url);
                }
            });

            result.ai_overview = { found: true, text_full: rawText, sources: sources };
        }

        // 2. Process Bing Organic results & Ads
        const items = document.querySelectorAll(BING.organicContainer + ", " + BING.ads);
        items.forEach(item => {
            if (item.querySelector('.algoSlug_icon') && !item.classList.contains('b_algo')) return; // ignore sidebar/wiki widgets
            
            let linkEl = item.querySelector(BING.organicHeader) || item.querySelector('a');
            if (!linkEl) return;
            
            let url = decodeBingUrl(linkEl.href);
            if (url === "N/A" || !url.startsWith('http') || url.includes('bing.com')) return;

            let titleEl = item.querySelector('.tptt') || item.querySelector('h2');
            let title = titleEl ? titleEl.innerText.trim() : linkEl.innerText.trim();
            
            let descEl = item.querySelector('.b_lineclamp, .b_ad_description, .b_caption p');
            let desc = descEl ? descEl.innerText.trim() : "";

            if (item.matches(BING.ads)) {
                result.ads.push({ rank: result.ads.length + 1, title: title, url: url, snippet: desc });
            } else {
                result.organic.push({ rank: rankOffset + result.organic.length + 1, title: title, url: url, snippet: desc });
            }
        });

        sessionStorage.setItem("rat_organic_count", (rankOffset + result.organic.length).toString());
        return result;
    }

    // --- NAVIGATION & CONSENT ---
    /**
     * Logic for finding and clicking the "Next" button in pagination.
     * @returns {Promise<Object>} Status of navigation success.
     */
    async function navigateToNext() {
        let nextBtn = document.querySelector(isBing ? BING.nextId : GOOGLE.nextId);
        
        // Bing Fallback: If no explicit next ID, calculate based on active pagination index
        if (!nextBtn && isBing) {
             const activePage = document.querySelector('.sb_pagS');
             if (activePage && activePage.nextElementSibling) {
                 nextBtn = activePage.nextElementSibling.querySelector('a');
             }
        }
        
        // Google Fallback: Construct next URL parameter based on current "start" index
        if (!nextBtn && !isBing) {
            const match = window.location.href.match(/start=(\d+)/);
            let nextStart = match ? parseInt(match[1]) + 10 : 10;
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

    /** Finds and accepts standard cookie consent banners. */
    function handleCookieConsent() {
        const btn = document.querySelector(BING.cookieBtn) || document.getElementById('L2AGLb') || document.getElementById('W0wltc');
        if (btn) {
            btn.click();
            return true;
        }
        return false;
    }

    /** Scans and dismisses modal dialogs or popups that obstruct the scraping view. */
    function handleGooglePopups() {
        const keywords = ["ok", "confirm", "accept", "agree", "continue", "not now", "no thanks", "later", "reject", "bestätigen", "akzeptieren", "zustimmen", "fortfahren", "nicht jetzt", "nein danke", "später", "ablehnen", "pas maintenant"];
        const dialogs = document.querySelectorAll('.mcPPZ, .qk7LXc, minor-moment-dialog, [role="dialog"]');

        for (const dlg of dialogs) {
            if (dlg.offsetParent === null) continue; 
            const buttons = dlg.querySelectorAll('g-raised-button, button, [role="button"], .M9Bg4d');
            for (const btn of buttons) {
                const text = (btn.innerText || "").toLowerCase().trim();
                if (keywords.some(k => k.length < 4 ? text === k : text.includes(k))) {
                    try { btn.click(); return true; } catch(e) {}
                }
            }
        }
        return false;
    }
}