// ==UserScript==
// @name         正风网校-后台挂机终结版-V15.1 (ForceRefresh)
// @namespace    http://tampermonkey.net/
// @version      15.1
// @description  【V15.1】修复循环开关窗问题：播放窗口关闭后强制刷新 tingke 页面。
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
        minDelayAfterRefresh: 3000,
        maxDelayAfterRefresh: 15000,

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
    const PLAYER_COUNT_KEY = 'zfwx_player_count';
    const NEED_REFRESH_KEY = 'zfwx_need_refresh';  // 【新增】刷新信号

    let currentSpeed = 8.0;
    let pageFullyLoaded = false;

    function log(msg, color = "#00bcd4") {
        if (!CONFIG.debug) return;
        console.log(`%c[正风V15.1]%c ${msg}`, `color:${color};font-weight:bold`, "");
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

    // --- 刷新信号机制 ---
    function setNeedRefresh() {
        localStorage.setItem(NEED_REFRESH_KEY, Date.now().toString());
    }

    function checkAndClearNeedRefresh() {
        const val = localStorage.getItem(NEED_REFRESH_KEY);
        if (val) {
            localStorage.removeItem(NEED_REFRESH_KEY);
            return true;
        }
        return false;
    }

    // --- 播放窗口计数器 ---
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
            log("心跳超时 (>60秒)，准备刷新...", "#4CAF50");
            clearPlayerLock();
            resetPlayerCount();
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

                if (elapsed >= CONFIG.maxDelayAfterRefresh) {
                    log("等待超时，继续执行", "#FF9800");
                    resolve();
                    return;
                }

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
        div.style.cssText = `position:fixed;top:60px;right:20px;width:280px;background:rgba(0,0,0,0.92);border:2px solid #009688;color:#fff;padding:12px;z-index:999999;border-radius:10px;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);`;
        div.innerHTML = `
            <div style="font-weight:bold;color:#009688;margin-bottom:8px;font-size:14px;">🚀 正风控制中心 V15.1</div>
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
        log("控制中心启动 (强制刷新模式)", "#009688");

        // 等待页面加载
        await waitForPageReady();
        pageFullyLoaded = true;

        // 启动主循环
        tingkeLoop();
        setInterval(tingkeLoop, CONFIG.tingkeScanInterval);

        // 【新增】监听 localStorage 变化，实时响应刷新信号
        window.addEventListener('storage', (e) => {
            if (e.key === NEED_REFRESH_KEY && e.newValue) {
                log("收到刷新信号，3秒后刷新...", "#009688");
                setTimeout(() => location.reload(), 3000);
            }
        });
    }

    function tingkeLoop() {
        if (!pageFullyLoaded) {
            log("等待页面加载...", "#FF9800");
            return;
        }

        updateCountDisplay();

        // 【新增】检查是否需要刷新（播放窗口正常关闭时设置的信号）
        if (checkAndClearNeedRefresh()) {
            log("检测到刷新信号，3秒后刷新...", "#009688");
            setTimeout(() => location.reload(), 3000);
            return;
        }

        const status = checkPlayerStatus();

        // 心跳超时也刷新
        if (status === 'timeout') {
            log("心跳超时，刷新页面...", "#009688");
            setTimeout(() => location.reload(), 1000);
            return;
        }

        // 播放中
        if (status === 'playing') {
            const lastHB = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
            const ago = Math.round((Date.now() - lastHB) / 1000);
            const storedProgress = getStoredProgress();
            const speed = getSpeedForProgress(storedProgress);
            updateSpeedDisplay(speed);
            log(`播放中 (初始${storedProgress}%, ${speed}x, ${ago}秒前心跳)`, "#FF9800");
            return;
        }

        // 防止多窗口
        if (getPlayerCount() > 0) {
            log(`已有 ${getPlayerCount()} 个窗口，等待...`, "#FF9800");
            return;
        }

        // 空闲，找下一个
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
                log(`发现 ${progress}% 课程，${speed}x 倍速`, "#4CAF50");
                setPlayerLock(progress);
                incrementPlayerCount();
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
                log(`(备用) ${progress}% 课程，${speed}x`, "#4CAF50");
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

        log(`播放启动 (${storedProgress}%, ${currentSpeed}x)`, "#E91E63");
        updateSpeedDisplay(currentSpeed);
        updateCountDisplay();

        document.body.addEventListener('click', enableBackgroundAudio, { once: true });

        setPlayerLock(storedProgress);

        setInterval(() => {
            updateHeartbeat();
        }, CONFIG.heartbeatInterval);

        // 【关键修复】窗口关闭前：清除锁、减计数、设置刷新信号
        window.addEventListener('beforeunload', () => {
            clearPlayerLock();
            decrementPlayerCount();
            setNeedRefresh();  // 通知 tingke 刷新
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
                setNeedRefresh();
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
            log("课程已完成，关闭窗口...", "#4CAF50");
            clearPlayerLock();
            decrementPlayerCount();
            setNeedRefresh();
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