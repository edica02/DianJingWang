// ==UserScript==
// @name         正风网校-后台挂机终结版-V15.0 (SmartDelay)
// @namespace    http://tampermonkey.net/
// @version      15.0
// @description  【V15.0】智能延迟：等待页面完全加载后再操作；防止多窗口同时打开。
// @author       Assistant
// @match        *://*.zfwx.com/*
// @match        *://vv.zfwx.com/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        debug: true,
        autoReply: "老师我在，正在认真听课",
        tingkeScanInterval: 5000,
        playerScanInterval: 1000,
        heartbeatInterval: 10000,
        heartbeatTimeout: 60000,

        // 智能延迟配置
        minDelayAfterRefresh: 3000,    // 刷新后最少等待 3 秒
        maxDelayAfterRefresh: 15000,   // 刷新后最多等待 15 秒

        // 动态倍速配置
        speedTiers: [
            { threshold: 95, speed: 2.0 },
            { threshold: 85, speed: 4.0 },
            { threshold: 0, speed: 8.0 }
        ]
    };

    const LOCK_KEY = 'zfwx_player_open';
    const HEARTBEAT_KEY = 'zfwx_player_heartbeat';
    const PROGRESS_KEY = 'zfwx_player_progress';
    const PLAYER_COUNT_KEY = 'zfwx_player_count';  // 新增：播放窗口计数
    const PAGE_LOAD_TIME_KEY = 'zfwx_page_load_time'; // 新增：页面加载时间戳

    let currentSpeed = 8.0;
    let pageFullyLoaded = false;

    function log(msg, color = "#00bcd4") {
        if (!CONFIG.debug) return;
        console.log(`%c[正风V15.0]%c ${msg}`, `color:${color};font-weight:bold`, "");
        const el = document.getElementById('z-status-text');
        if (el) el.innerText = msg;
    }

    function getCurProgress(node) {
        try {
            const text = (node || document).innerText || "";
            const match = text.match(/(\d+)%/);
            if (match) return parseInt(match[1], 10);
        } catch (e) { }
        return -1;
    }

    function getSpeedForProgress(progress) {
        for (const tier of CONFIG.speedTiers) {
            if (progress >= tier.threshold) {
                return tier.speed;
            }
        }
        return 8.0;
    }

    // --- 播放窗口计数器（防止多窗口） ---
    function getPlayerCount() {
        return parseInt(localStorage.getItem(PLAYER_COUNT_KEY) || '0', 10);
    }

    function incrementPlayerCount() {
        const count = getPlayerCount() + 1;
        localStorage.setItem(PLAYER_COUNT_KEY, count.toString());
        return count;
    }

    function decrementPlayerCount() {
        const count = Math.max(0, getPlayerCount() - 1);
        localStorage.setItem(PLAYER_COUNT_KEY, count.toString());
        return count;
    }

    function resetPlayerCount() {
        localStorage.setItem(PLAYER_COUNT_KEY, '0');
    }

    // --- 心跳锁定机制 ---
    function checkPlayerStatus() {
        const locked = localStorage.getItem(LOCK_KEY) === 'true';
        if (!locked) return 'idle';

        const lastHeartbeat = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
        const now = Date.now();

        if (now - lastHeartbeat > CONFIG.heartbeatTimeout) {
            log("心跳超时 (>60秒无响应)，准备刷新页面...", "#4CAF50");
            clearPlayerLock();
            resetPlayerCount(); // 心跳超时时重置计数器
            return 'timeout';
        }

        return 'playing';
    }

    function isPlayerWindowOpen() {
        return checkPlayerStatus() === 'playing';
    }

    function setPlayerLock(progress) {
        localStorage.setItem(LOCK_KEY, 'true');
        localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
        if (progress !== undefined) {
            localStorage.setItem(PROGRESS_KEY, progress.toString());
        }
    }

    function updateHeartbeat() {
        localStorage.setItem(HEARTBEAT_KEY, Date.now().toString());
    }

    function clearPlayerLock() {
        localStorage.removeItem(LOCK_KEY);
        localStorage.removeItem(HEARTBEAT_KEY);
        localStorage.removeItem(PROGRESS_KEY);
    }

    function getStoredProgress() {
        const p = localStorage.getItem(PROGRESS_KEY);
        return p ? parseInt(p, 10) : -1;
    }

    // --- 智能等待页面加载 ---
    function waitForPageReady() {
        return new Promise((resolve) => {
            const startTime = Date.now();

            function checkReady() {
                const elapsed = Date.now() - startTime;

                // 最大等待时间到达
                if (elapsed >= CONFIG.maxDelayAfterRefresh) {
                    log("等待超时，继续执行", "#FF9800");
                    resolve();
                    return;
                }

                // 检查页面是否加载完成
                // 1. DOM 是否完全加载
                // 2. 是否有课程列表元素
                // 3. 是否还有 loading 状态
                const hasContent = document.querySelectorAll('span.player').length > 0 ||
                    document.querySelectorAll('.videoList').length > 0;
                const isLoading = document.body.innerText.includes('加载中') ||
                    document.querySelector('.loading');
                const minTimePassed = elapsed >= CONFIG.minDelayAfterRefresh;

                if (hasContent && !isLoading && minTimePassed) {
                    log(`页面加载完成 (${elapsed}ms)`, "#4CAF50");
                    resolve();
                    return;
                }

                // 继续等待
                setTimeout(checkReady, 500);
            }

            checkReady();
        });
    }

    // --- 核心黑科技 ---
    function spoofMultiple() {
        try {
            Object.defineProperty(unsafeWindow, 'multiple', {
                get: () => 2.0,
                set: () => { },
                configurable: true
            });
        } catch (e) { }
    }
    spoofMultiple();

    function hackVisibilityAPI() {
        try {
            Object.defineProperty(document, 'hidden', { value: false, configurable: true, writable: true });
            Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true, writable: true });
            const oldListen = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (type, listener, options) {
                if (['visibilitychange', 'blur'].includes(type)) return;
                return oldListen.call(this, type, listener, options);
            };
        } catch (e) { }
    }
    hackVisibilityAPI();

    function enableBackgroundAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 100;
            gain.gain.value = 0.0001;
            osc.start();
            setInterval(() => { if (ctx.state === 'suspended') ctx.resume(); }, 5000);
        } catch (e) { }
    }

    // --- UI 面板 ---
    function createPanel(mode) {
        if (document.getElementById('zfwx-v15-panel')) return;
        const div = document.createElement('div');
        div.id = 'zfwx-v15-panel';
        div.style.cssText = `position:fixed;top:60px;right:20px;width:280px;background:rgba(0,0,0,0.92);border:2px solid #673AB7;color:#fff;padding:12px;z-index:999999;border-radius:10px;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
        div.innerHTML = `
            <div style="font-weight:bold;color:#673AB7;margin-bottom:8px;font-size:14px;">🚀 正风控制中心 V15.0</div>
            <div style="margin:4px 0;">模式: <span style="color:#FFEB3B">${mode}</span></div>
            <div style="margin:4px 0;">倍速: <span id="z-speed-text" style="color:#4CAF50">--</span></div>
            <div style="margin:4px 0;">窗口: <span id="z-count-text" style="color:#03A9F4">0</span></div>
            <div style="margin:4px 0;">状态: <span id="z-status-text" style="color:#8BC34A">初始化...</span></div>
        `;
        document.body.appendChild(div);
    }

    function updateSpeedDisplay(speed) {
        const el = document.getElementById('z-speed-text');
        if (el) el.innerText = `${speed}x`;
    }

    function updateCountDisplay() {
        const el = document.getElementById('z-count-text');
        if (el) el.innerText = getPlayerCount().toString();
    }

    // ============================================================
    // ==================== TINGKE 页面逻辑 ====================
    // ============================================================
    async function runTingkeMode() {
        createPanel('TINGKE');
        log("控制中心启动 (智能延迟 + 多窗口防护)", "#673AB7");

        // 等待页面完全加载
        await waitForPageReady();
        pageFullyLoaded = true;

        // 启动主循环
        tingkeLoop();
        setInterval(tingkeLoop, CONFIG.tingkeScanInterval);
    }

    function tingkeLoop() {
        if (!pageFullyLoaded) {
            log("等待页面加载...", "#FF9800");
            return;
        }

        updateCountDisplay();
        const status = checkPlayerStatus();

        // 如果刚超时，刷新页面获取最新进度
        if (status === 'timeout') {
            log("刷新页面中...", "#673AB7");
            setTimeout(() => location.reload(), 1000);
            return;
        }

        // 播放中，等待
        if (status === 'playing') {
            const lastHB = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
            const ago = Math.round((Date.now() - lastHB) / 1000);
            const storedProgress = getStoredProgress();
            const speed = getSpeedForProgress(storedProgress);
            updateSpeedDisplay(speed);
            log(`播放中 (初始${storedProgress}%, ${speed}x倍速, ${ago}秒前心跳)`, "#FF9800");
            return;
        }

        // 检查是否已有播放窗口打开（防止多窗口）
        if (getPlayerCount() > 0) {
            log(`已有 ${getPlayerCount()} 个播放窗口，等待关闭...`, "#FF9800");
            return;
        }

        // 空闲状态，找下一个课程
        updateSpeedDisplay('--');
        expandAllCourses();

        setTimeout(() => {
            clickFirstIncompleteLecture();
        }, 2000);
    }

    function expandAllCourses() {
        const courseHeaders = document.querySelectorAll('span.classTitle.isCourse');

        let expanded = 0;
        courseHeaders.forEach(header => {
            const container = header.closest('.courseDetail') || header.parentElement;
            const videoLists = container ? container.querySelectorAll('.videoList') : [];

            if (videoLists.length === 0) {
                header.click();
                expanded++;
            }
        });

        if (expanded > 0) {
            log(`展开了 ${expanded} 个课程`, "#FF9800");
        }
    }

    function clickFirstIncompleteLecture() {
        if (isPlayerWindowOpen() || getPlayerCount() > 0) {
            return;
        }

        const playBtns = document.querySelectorAll('span.player');

        for (let btn of playBtns) {
            if (!btn.offsetParent) continue;

            const row = btn.closest('.videoList') || btn.parentElement?.parentElement;
            if (!row) continue;

            const progress = getCurProgress(row);

            if (progress !== -1 && progress < 100) {
                const speed = getSpeedForProgress(progress);
                log(`发现 ${progress}% 课程，将用 ${speed}x 倍速`, "#4CAF50");
                setPlayerLock(progress);
                incrementPlayerCount(); // 增加计数
                updateCountDisplay();

                const link = btn.closest('a') || btn.querySelector('a') || btn;
                const href = link.href || link.getAttribute('data-url');

                if (href) {
                    window.open(href, '_blank', 'noopener');
                } else {
                    btn.click();
                }

                setTimeout(() => window.focus(), 100);
                return;
            }
        }

        const altPlayBtns = Array.from(document.querySelectorAll('a, span')).filter(el =>
            el.innerText.trim() === '播放' && el.offsetParent
        );

        for (let btn of altPlayBtns) {
            const row = btn.closest('tr') || btn.closest('.videoList') || btn.parentElement?.parentElement;
            if (!row) continue;

            const progress = getCurProgress(row);
            if (progress !== -1 && progress < 100) {
                const speed = getSpeedForProgress(progress);
                log(`(备用) ${progress}% 课程，将用 ${speed}x 倍速`, "#4CAF50");
                setPlayerLock(progress);
                incrementPlayerCount();
                updateCountDisplay();

                const href = btn.href || btn.getAttribute('data-url');
                if (href) {
                    window.open(href, '_blank', 'noopener');
                } else {
                    btn.click();
                }
                setTimeout(() => window.focus(), 100);
                return;
            }
        }

        log("暂无未完课程，等待中...", "#9E9E9E");
    }

    // ============================================================
    // ==================== PLAYER 页面逻辑 ====================
    // ============================================================
    function runPlayerMode() {
        createPanel('PLAYER');

        const storedProgress = getStoredProgress();
        currentSpeed = getSpeedForProgress(storedProgress);

        log(`播放启动 (初始${storedProgress}%, ${currentSpeed}x倍速)`, "#E91E63");
        updateSpeedDisplay(currentSpeed);
        updateCountDisplay();

        document.body.addEventListener('click', enableBackgroundAudio, { once: true });

        setPlayerLock(storedProgress);

        setInterval(() => {
            updateHeartbeat();
        }, CONFIG.heartbeatInterval);

        // 窗口关闭前减少计数
        window.addEventListener('beforeunload', () => {
            clearPlayerLock();
            decrementPlayerCount();
        });

        setInterval(() => {
            handlePopups();
            manageVideo();
            spoofMultiple();
        }, CONFIG.playerScanInterval);
    }

    function manageVideo() {
        const v = document.querySelector('video');
        if (!v) return;

        if (v.playbackRate !== currentSpeed) {
            v.playbackRate = currentSpeed;
            v.muted = true;
            log(`设置 ${currentSpeed}x 倍速`, "#E91E63");
            updateSpeedDisplay(currentSpeed);
        }

        if (typeof unsafeWindow.multiple !== 'undefined') {
            unsafeWindow.multiple = 2.0;
        }

        if (v.paused && !v.ended && v.readyState > 2) {
            v.play().catch(() => { });
        }

        if (v.ended) {
            log("🎉 播放结束，关闭窗口...", "#4CAF50");
            setTimeout(() => {
                clearPlayerLock();
                decrementPlayerCount();
                window.close();
            }, 2000);
        }
    }

    function handlePopups() {
        const resume = document.querySelector('.play_sureBtn');
        if (resume && resume.offsetParent) {
            resume.click();
            log("关闭'继续学习'弹窗", "#FF9800");
        }

        const reply = document.querySelector('.timeoutTip a, .pop-up-box-btn2');
        if (reply && reply.offsetParent && reply.innerText.includes('回复')) {
            reply.click();
            setTimeout(() => {
                const area = document.querySelector('.play_chatTxt textarea');
                const btn = document.querySelector('.play_chatTxt a');
                if (area && btn) {
                    area.value = CONFIG.autoReply;
                    area.dispatchEvent(new Event('input', { bubbles: true }));
                    btn.click();
                    log("自动回复查岗", "#FF9800");
                }
            }, 500);
        }

        const cont = document.querySelector('.test_ContinueBtn');
        if (cont && cont.offsetParent) cont.click();

        const layerBtn = document.querySelector('.layui-layer-btn0, .layui-layer-btn a');
        if (layerBtn && layerBtn.offsetParent) {
            const txt = document.body.innerText;
            if (txt.includes('重复') || txt.includes('多窗口') || txt.includes('不计入')) {
                layerBtn.click();
                log("关闭重复听课警告", "#f44336");
            }
        }

        // 检测"课程已听完"弹窗
        const bodyText = document.body.innerText;
        if (bodyText.includes('已经听完') || (bodyText.includes('听完') && (bodyText.includes('重新听') || bodyText.includes('继续听')))) {
            log("检测到课程已完成弹窗，关闭窗口", "#4CAF50");
            clearPlayerLock();
            decrementPlayerCount();
            window.close();
            return;
        }
    }

    // ============================================================
    // ==================== 启动入口 ====================
    // ============================================================
    window.addEventListener('load', () => {
        const url = location.href;

        if (url.includes('/tingke')) {
            runTingkeMode();
        } else if (url.includes('/wxqt/package/course')) {
            runPlayerMode();
        }
    });

})();