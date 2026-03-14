// ==UserScript==
// @name         正风网校-后台挂机终结版-V16.2 (SingleWindow)
// @namespace    http://tampermonkey.net/
// @version      16.2
// @description  【V16.2】严格单窗口：彻底修复多窗口并发问题。
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

        minDelayAfterRefresh: 3000,
        maxDelayAfterRefresh: 15000,

        defaultSpeed: 2.0,
        availableSpeeds: [2, 4, 8],

        shortVideoDuration: 600,
        shortVideoSpeed: 2.0
    };

    const LOCK_KEY = 'zfwx_player_open';
    const HEARTBEAT_KEY = 'zfwx_player_heartbeat';
    const PROGRESS_KEY = 'zfwx_player_progress';
    const NEED_REFRESH_KEY = 'zfwx_need_refresh';
    const SPEED_KEY = 'zfwx_user_speed';

    let currentSpeed = CONFIG.defaultSpeed;
    let pageFullyLoaded = false;
    let videoDurationChecked = false;
    let isShortVideo = false;
    let isLaunching = false;  // 【新增】本地锁：防止同一页面内重复触发

    function log(msg, color = "#00bcd4") {
        if (!CONFIG.debug) return;
        console.log(`%c[正风V16.2]%c ${msg}`, `color:${color};font-weight:bold`, "");
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

    // --- 用户速度设置 ---
    function getUserSpeed() {
        const saved = localStorage.getItem(SPEED_KEY);
        return saved ? parseFloat(saved) : CONFIG.defaultSpeed;
    }

    function setUserSpeed(speed) {
        localStorage.setItem(SPEED_KEY, speed.toString());
        currentSpeed = speed;
        updateSpeedDisplay(speed);
        updateSpeedButtons(speed);
        const v = document.querySelector('video');
        if (v) {
            v.playbackRate = speed;
            log(`切换到 ${speed}x 倍速`, "#4CAF50");
        }
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

    // --- 严格单窗口锁定机制 ---
    // 只有一个信号：LOCK_KEY + HEARTBEAT_KEY
    // - 设置锁 = 播放窗口正在运行
    // - tingke 打开播放前先设锁，再打开
    // - 每次循环先检查锁 + 本地 isLaunching 标记

    function isPlayerActive() {
        const locked = localStorage.getItem(LOCK_KEY) === 'true';
        if (!locked) return false;

        const lastHeartbeat = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
        const now = Date.now();

        if (now - lastHeartbeat > CONFIG.heartbeatTimeout) {
            log("心跳超时 (>60秒)，解锁", "#4CAF50");
            clearPlayerLock();
            return false;
        }

        return true;
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
        if (document.getElementById('zfwx-v16-panel')) return;
        const div = document.createElement('div');
        div.id = 'zfwx-v16-panel';
        div.style.cssText = `position:fixed;top:60px;right:20px;width:280px;background:rgba(0,0,0,0.92);border:2px solid #FF5722;color:#fff;padding:12px;z-index:999999;border-radius:10px;font-size:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);`;

        const currentUserSpeed = getUserSpeed();

        div.innerHTML = `
            <div style="font-weight:bold;color:#FF5722;margin-bottom:8px;font-size:14px;">🚀 正风控制中心 V16.2</div>
            <div style="margin:4px 0;">模式: <span style="color:#FFEB3B">${mode}</span></div>
            <div style="margin:4px 0;">倍速: <span id="z-speed-text" style="color:#4CAF50">${currentUserSpeed}x</span></div>
            <div style="margin:8px 0;">
                <span style="margin-right:8px;">切换:</span>
                ${CONFIG.availableSpeeds.map(s => `
                    <button id="z-speed-btn-${s}" data-speed="${s}"
                        style="margin:2px;padding:4px 12px;border:none;border-radius:4px;cursor:pointer;
                               background:${s === currentUserSpeed ? '#FF5722' : '#444'};
                               color:${s === currentUserSpeed ? '#fff' : '#aaa'};">${s}x</button>
                `).join('')}
            </div>
            <div style="margin:4px 0;">状态: <span id="z-status-text" style="color:#8BC34A">初始化...</span></div>
        `;
        document.body.appendChild(div);

        CONFIG.availableSpeeds.forEach(s => {
            const btn = document.getElementById(`z-speed-btn-${s}`);
            if (btn) {
                btn.addEventListener('click', () => setUserSpeed(s));
            }
        });
    }

    function updateSpeedDisplay(speed) {
        const el = document.getElementById('z-speed-text');
        if (el) el.innerText = `${speed}x`;
    }

    function updateSpeedButtons(activeSpeed) {
        CONFIG.availableSpeeds.forEach(s => {
            const btn = document.getElementById(`z-speed-btn-${s}`);
            if (btn) {
                btn.style.background = s === activeSpeed ? '#FF5722' : '#444';
                btn.style.color = s === activeSpeed ? '#fff' : '#aaa';
            }
        });
    }

    // ============================================================
    // ==================== TINGKE 页面逻辑 ====================
    // ============================================================
    async function runTingkeMode() {
        createPanel('TINGKE');
        log("控制中心启动 (严格单窗口)", "#FF5722");

        await waitForPageReady();
        pageFullyLoaded = true;

        tingkeLoop();
        setInterval(tingkeLoop, CONFIG.tingkeScanInterval);

        window.addEventListener('storage', (e) => {
            if (e.key === NEED_REFRESH_KEY && e.newValue) {
                log("收到刷新信号，3秒后刷新...", "#FF5722");
                setTimeout(() => location.reload(), 3000);
            }
        });
    }

    function tingkeLoop() {
        if (!pageFullyLoaded) {
            log("等待页面加载...", "#FF9800");
            return;
        }

        // 【关键】本地锁：已经在打开窗口的过程中，跳过
        if (isLaunching) {
            log("正在打开窗口，跳过...", "#FF9800");
            return;
        }

        if (checkAndClearNeedRefresh()) {
            log("检测到刷新信号，3秒后刷新...", "#FF5722");
            setTimeout(() => location.reload(), 3000);
            return;
        }

        // 检查是否有活跃的播放窗口
        if (isPlayerActive()) {
            const lastHB = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
            const ago = Math.round((Date.now() - lastHB) / 1000);
            const storedProgress = getStoredProgress();
            const speed = getUserSpeed();
            updateSpeedDisplay(speed);
            log(`播放中 (${storedProgress}%, ${speed}x, ${ago}秒前心跳)`, "#FF9800");
            return;
        }

        // 检查心跳超时（isPlayerActive 已处理，此时状态为 idle）
        // 如果锁刚被清除，刷新页面获取最新进度
        const lockJustCleared = !localStorage.getItem(LOCK_KEY) && 
                                 localStorage.getItem('zfwx_was_playing') === 'true';
        if (lockJustCleared) {
            localStorage.removeItem('zfwx_was_playing');
            log("播放刚结束，刷新获取最新进度...", "#FF5722");
            setTimeout(() => location.reload(), 1000);
            return;
        }

        // 空闲，找下一个
        updateSpeedDisplay(getUserSpeed());
        expandAllCourses();

        // 【关键修改】不再用 setTimeout 延迟，直接执行但加本地锁
        setTimeout(() => {
            if (!isLaunching && !isPlayerActive()) {
                clickFirstIncompleteLecture();
            }
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
        // 三重检查：本地锁 + localStorage 锁 + 是否活跃
        if (isLaunching || isPlayerActive()) {
            return;
        }

        const playBtns = document.querySelectorAll('span.player');

        for (let btn of playBtns) {
            if (!btn.offsetParent) continue;

            const row = btn.closest('.videoList') || btn.parentElement?.parentElement;
            if (!row) continue;

            const progress = getCurProgress(row);

            if (progress !== -1 && progress < 100) {
                const speed = getUserSpeed();
                log(`发现 ${progress}% 课程，${speed}x 倍速`, "#4CAF50");

                // 1. 先设本地锁（立即生效，防止同一 JS 线程内重复进入）
                isLaunching = true;
                // 2. 再设 localStorage 锁（跨标签页生效）
                setPlayerLock(progress);
                // 3. 标记正在播放（用于刷新检测）
                localStorage.setItem('zfwx_was_playing', 'true');

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
                const speed = getUserSpeed();
                log(`(备用) ${progress}% 课程，${speed}x`, "#4CAF50");

                isLaunching = true;
                setPlayerLock(progress);
                localStorage.setItem('zfwx_was_playing', 'true');

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
        currentSpeed = getUserSpeed();

        log(`播放启动 (${storedProgress}%, ${currentSpeed}x)`, "#E91E63");
        updateSpeedDisplay(currentSpeed);

        document.body.addEventListener('click', enableBackgroundAudio, { once: true });

        // 确保锁定
        setPlayerLock(storedProgress);

        // 心跳
        setInterval(() => {
            updateHeartbeat();
        }, CONFIG.heartbeatInterval);

        // 关闭前清除
        window.addEventListener('beforeunload', () => {
            clearPlayerLock();
            setNeedRefresh();
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

        if (!videoDurationChecked && v.duration && !isNaN(v.duration)) {
            videoDurationChecked = true;
            if (v.duration < CONFIG.shortVideoDuration) {
                isShortVideo = true;
                if (currentSpeed > CONFIG.shortVideoSpeed) {
                    currentSpeed = CONFIG.shortVideoSpeed;
                    log(`短视频 (${Math.round(v.duration/60)}分钟)，降为 ${currentSpeed}x`, "#FF9800");
                }
            } else {
                log(`视频时长 ${Math.round(v.duration/60)} 分钟`, "#9E9E9E");
            }
        }

        const targetSpeed = isShortVideo ? Math.min(currentSpeed, CONFIG.shortVideoSpeed) : getUserSpeed();

        if (v.playbackRate !== targetSpeed) {
            v.playbackRate = targetSpeed;
            v.muted = true;
            currentSpeed = targetSpeed;
            log(`设置 ${targetSpeed}x 倍速${isShortVideo ? ' (短视频)' : ''}`, "#E91E63");
            updateSpeedDisplay(targetSpeed);
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

        const bodyText = document.body.innerText;
        if (bodyText.includes('已经听完') || (bodyText.includes('听完') && (bodyText.includes('重新听') || bodyText.includes('继续听')))) {
            log("课程已完成，关闭窗口...", "#4CAF50");
            clearPlayerLock();
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