// 在项目根目录创建新的注入脚本文件
// 将原main.js中executeJavaScript的完整脚本内容复制到此处
// 这个文件只包含纯粹的JS代码，不包含Electron主进程或Node.js代码

// ==UserScript==
// @name         Study Injector
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Injects scripts to automate study tasks
// @author       You
// @match        https://stu.5zk.com.cn/zk8exam/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ===== 全局变量 =====
    let lastAutoplayTime = 0; // 记录上次自动播放时间
    let _alertType = 'not_exercise'; // 记录弹窗类型
    let videoEventBound = false; // 标记视频事件是否已绑定
    const injectedCourseName = "${courseName}";
    let noAlertNeedRefresh = false; // 标记没有alert后是否需要刷新

    // 章节列表缓存
    let chapterListCache = null;

    // 自动播放模式，默认为开启
    window.isAutoPlayEnabled = true;

    // ===== 工具函数 =====
    /**
     * 判断当前页面是否为课程页面
     * @returns {boolean} 是否为课程页面
     */
    function isCoursePage() {
        // 所有课程和视频播放页面都使用 jp_wiki_study.php
        return window.location.href.includes('jp_wiki_study.php') ||
            // 作为备用检查，查找页面中的章节列表元素
            document.querySelector('.list.list-activity') !== null;
    }

    // 判断是否为章节练习页面
    function isExercisePage() {
        return window.location.href.includes('wiki_exam_zy.php');
    }

    // 判断当前是否是自动跳转的页面
    function isAutoJumpedPage() {
        return window.location.href.includes('autoJumped=1');
    }

    // 判断当前是否是首次进入课程页面
    function isFirstEntryPage() {
        return window.location.href.includes('is_sp=1');
    }

    // 格式化章节状态，返回 not_started, in_progress, completed 或 null
    function checkChapterStatus(chapter) {
        try {
            const span = chapter.querySelector('span');
            if (!span) return null;
            const color = window.getComputedStyle(span).color;
            if (color === 'rgb(234, 0, 0)' || color === '#EA0000') return 'not_started';
            if (color === 'rgb(255, 128, 0)' || color === '#FF8000') return 'in_progress';
            if (color === 'rgb(0, 166, 0)' || color === '#00A600') return 'completed';
            const text = span.textContent.trim();
            if (text.includes('未开始')) return 'not_started';
            if (text.includes('进行中')) return 'in_progress';
            if (text.includes('已完成')) return 'completed';
            return null;
        } catch { return null; }
    }

    // ===== 弹窗处理 =====
    // 重写confirm和prompt，防止弹窗干扰
    window.confirm = function () { return true; };
    window.prompt = function () { return ''; };

    // 全局弹窗劫持
    // const originalAlert = window.alert;
    window.alert = function (message) {
        console.log(`[弹窗处理] 捕获alert弹窗: ${message}`);
        noAlertNeedRefresh = false;

        // 判断弹窗类型
        if (message.includes('前往完成章节练习')) {
            window.alertType = 'exercise';
        } else if (message.includes('不需要进行章节练习')) {
            window.alertType = 'not_exercise';
        } else {
            window.alertType = 'others';
        }
        return;
    };

    // 使用 getter 和 setter 监听 alertType 变化
    Object.defineProperty(window, 'alertType', {
        get: function () {
            return _alertType;
        },
        set: function (newValue) {
            _alertType = newValue;
            // 触发自定义事件
            window.dispatchEvent(new Event('alertTypeChange'));
        }
    });

    // 添加监听 alertType 变化
    window.addEventListener('alertTypeChange', function () {
        console.log(`[弹窗处理] alertType 变化为: ${window.alertType}`);

        // 根据不同类型的弹窗执行不同操作
        switch (window.alertType) {
            case 'exercise':
                console.log('[弹窗处理] 检测到章节练习弹窗，由页面处理自动返回课程页面');
                break;
            case 'not_exercise':
                console.log('[弹窗处理] 检测到无需章节练习弹窗，刷新页面');
                window.location.reload();
                break;
            case 'others':
                console.log('[弹窗处理] 检测到其他弹窗，暂不作处理');
                break;
        }
    });

    // ===== 章节列表处理 =====
    /**
     * 提取课程学习页面的章节列表信息
     * 这是应用中主要的章节提取逻辑，用于获取课程章节的状态、标题和URL等信息
     * 
     * @param {boolean} forceRefresh - 是否强制刷新缓存
     * @returns {Object} 包含章节列表和当前章节的对象
     */
    function extractChapterList(forceRefresh = false) {
        // 由用户决定是否使用缓存
        if (!forceRefresh && chapterListCache) {
            return chapterListCache;
        }

        // 获取章节列表
        const chapterElements = document.querySelectorAll('.list.list-activity li .font-w200 a');
        if (chapterElements.length === 0) {
            return { chapters: [], currentChapter: '' };
        }

        const pageUrl = window.location.href;
        const chapters = Array.from(chapterElements).map(a => {
            // 提取章节信息
            const span = a.querySelector('span');
            const color = span ? window.getComputedStyle(span).color : '';
            const status = checkChapterStatus(a);
            const title = span ? span.textContent.trim() : a.textContent.trim();
            const url = a.href;

            // 判断当前章节
            let isCurrent = false;
            const currentJjwikiid = document.querySelector('#jjwikiid')?.value; // 从页面获取当前章节ID
            const match = url.match(/jjwikiid=([\d]+)/);
            if (match) {
                if (currentJjwikiid && currentJjwikiid === match[1]) {
                    isCurrent = true;
                    console.log('[章节获取] 当前章节标题为:', title);
                }
            }

            // 判断章节是否已完成
            const isCompleted = status === 'completed';

            return {
                title,      // 章节标题
                url,        // 章节URL
                status,     // 章节状态：not_started, in_progress, completed
                color,      // 章节状态颜色
                isCompleted, // 是否已完成
                isCurrent   // 是否是当前章节
            };
        });

        // 获取当前章节标题
        const currentChapter = chapters.find(c => c.isCurrent)?.title || '';

        // 更新缓存
        chapterListCache = { chapters, currentChapter };
        return chapterListCache;
    }

    /**
     * 发送章节信息到主进程
     * 收集当前课程和章节信息，并通过IPC发送给主进程
     */
    function sendChapterInfo() {
        // 强制刷新缓存，确保获取最新的章节信息
        const { chapters, currentChapter } = extractChapterList(true);

        // 获取课程名称和学员姓名
        const courseName = document.querySelector('.course-title, .course-name, .title')?.textContent.trim() || injectedCourseName || '';
        const studentName = document.querySelector('.sidebar-mini-hidden-b .list-inline-item a[href="user_s.php"]')?.textContent.replace('学员：', '').trim() || '';

        // 构建完整的信息对象
        const info = {
            chapters,           // 章节列表
            currentChapter,     // 当前章节
            courseName,         // 课程名称
            studentName,        // 学员姓名
            totalChapters: chapters.length  // 总章节数
        };

        // 序列化信息对象
        const infoStr = JSON.stringify(info);

        // 避免重复发送相同的信息
        if (sessionStorage.getItem('lastChapterInfo') === infoStr) return;

        // 保存最新信息到会话存储
        sessionStorage.setItem('lastChapterInfo', infoStr);

        // 发送信息到主进程
        if (window.electronAPI && window.electronAPI.sendChapterInfo) {
            window.electronAPI.sendChapterInfo(infoStr);
            console.log('[章节获取] 章节信息已发送到主进程');
        }
    }

    // ===== 章节跳转 =====
    // 自动跳转到第一个未完成章节
    function jumpToFirstIncompleteChapter() {
        // 如果自动播放模式关闭，则不自动跳转
        if (!window.isAutoPlayEnabled) {
            console.log('[章节跳转] 自动播放模式已关闭，不执行自动跳转');
            return;
        }

        if (!isCoursePage()) {
            console.log('[章节跳转] 当前页面不是课程页面，不执行自动跳转');
            return;
        }

        // 查找第一个未完成章节
        let foundCurrentCompleted = false;
        for (const chapter of extractChapterList().chapters) {
            if (chapter.isCurrent && chapter.isCompleted) {
                foundCurrentCompleted = true;
                continue;
            }

            if (chapter.status === 'not_started' || chapter.status === 'in_progress') {
                let url = chapter.url;
                if (!url.includes('autoJumped=1')) {
                    url += (url.includes('?') ? '&' : '?') + 'autoJumped=1';
                }
                console.log(`[章节跳转] 跳转到未完成章节: ${chapter.title}`);
                window.location.href = url;
                return;
            }
        }

        console.log('[章节跳转] 没有未完成章节，无需跳转');
    }

    // ===== 视频处理 =====
    // 自动播放视频（只在未开始/进行中章节）
    async function attemptAutoplay(retry = 0) {
        // 如果自动播放模式关闭，则不自动播放
        if (!window.isAutoPlayEnabled) {
            console.log('[自动播放] 自动播放模式已关闭，不执行自动播放');
            return;
        }

        if (isExercisePage()) {
            console.log('[自动播放] 当前页面为章节练习页面，不执行自动播放');
            return;
        }

        // 检查是否已完成，如已完成则不播放
        if (sessionStorage.getItem('currentChapterStatus') === 'completed') {
            console.log('[自动播放] 当前章节已完成，跳过自动播放');
            return;
        }

        // 防止频繁调用
        const now = Date.now();
        if (now - lastAutoplayTime < 1000) return;
        lastAutoplayTime = now;

        const video = document.querySelector('video');
        if (!video) return;

        // 设置视频属性并尝试播放
        video.muted = true;
        video.playsInline = true;
        video.loop = false;

        if (!video.paused && !video.ended) {
            console.log('[自动播放] 检测到视频已自动播放，已自动静音并设置内联，无需脚本干预');
            return;
        }

        try {
            console.log('[自动播放] 正在尝试自动播放...');
            await video.play();
            console.log('[自动播放] 视频处于暂停或停止状态，由脚本自动静音播放');
        } catch (e) {
            console.log(`[自动播放] video.play() 执行失败: ${e.message}`);
            if (retry < 5) {
                setTimeout(() => attemptAutoplay(retry + 1), 1000);
            } else {
                console.log('[自动播放] 多次尝试播放失败，放弃本次自动播放');
            }
        }
    }

    // 监听视频播放完成
    function setupVideoCompletionDetection() {
        const video = document.querySelector('video');
        if (!video) return;
        if (videoEventBound) return;

        videoEventBound = true;
        let videoCompleted = false;

        // 发送视频状态到主进程
        function sendVideoStatus(status, retry = 0) {
            const { currentChapter } = extractChapterList();
            // 如果currentChapter为空或未知章节，延迟100ms重试，最多10次
            if ((!currentChapter || currentChapter === '未知章节') && retry < 10) {
                setTimeout(() => sendVideoStatus(status, retry + 1), 100);
                return;
            }

            if (window.electronAPI && window.electronAPI.sendVideoStatus) {
                window.electronAPI.sendVideoStatus({
                    status,
                    currentTime: video.currentTime,
                    duration: video.duration,
                    chapter: currentChapter || '未知章节'
                });
            }
        }

        // 监听视频事件
        video.addEventListener('play', () => {
            if (!videoCompleted) sendVideoStatus('播放中');
        });

        video.addEventListener('pause', () => {
            if (!videoCompleted) sendVideoStatus('暂停');
        });

        video.addEventListener('ended', () => {
            videoCompleted = true;
            sendVideoStatus('已完成');
            console.log('[章节跳转] 章节播放完成，等待弹窗处理...');

            noAlertNeedRefresh = true;
            // 2s后触发刷新，应对没有弹窗的章节
            setTimeout(() => {
                if (noAlertNeedRefresh) {
                    console.log('[章节跳转] 没有发现弹窗，2s后刷新页面');
                    window.location.reload();
                }
            }, 2000);
        });
    }

    // ===== 页面初始化和事件监听 =====
    // 监听视频元素
    const videoObserver = new MutationObserver(() => {
        const video = document.querySelector('video');
        if (video && !video.hasAttribute('data-listener-attached')) {
            video.setAttribute('data-listener-attached', 'true');
            videoEventBound = false;
            console.log('[视频处理] 发现video元素，绑定事件');
            setupVideoCompletionDetection();

            // 延迟1秒后尝试自动播放
            setTimeout(() => attemptAutoplay(), 1000);
        }
    });
    videoObserver.observe(document.body, { childList: true, subtree: true });

    // 兼容外部调用
    // window.goToFirstIncompleteChapter = jumpToFirstIncompleteChapter;

    // ===== 页面加载完成后的处理 =====
    if (window.electronAPI) {
        // 监听 study-injector-ready 事件
        window.electronAPI.on('study-injector-ready', function () {
            console.log('[页面处理] 页面加载完成');
            sessionStorage.setItem('currentChapterStatus', ' ');

            // 1. 处理课程页面
            if (isCoursePage()) {
                // 发送章节信息到主进程，会强制刷新章节信息缓存
                sendChapterInfo();

                // 获取当前章节状态是 not_started 还是 in_progress 还是 completed
                // 先找到当前章节，然后获取当前章节状态
                const currentChapter = extractChapterList().chapters.find(ch => ch.isCurrent);
                const currentChapterStatus = currentChapter ? currentChapter.status : null;

                if (currentChapterStatus) {
                    sessionStorage.setItem('currentChapterStatus', currentChapterStatus || 'unknown');
                    console.log('[页面处理] 记录当前章节状态:', sessionStorage.getItem('currentChapterStatus'));
                } else {
                    console.log('[页面处理] 未找到当前章节状态');
                }

                // 首次进入课程页面
                if (isFirstEntryPage()) {
                    // 记录当前页面URL到本地存储
                    sessionStorage.setItem('studyUrl', window.location.href);
                    console.log('[页面处理] 首次进入课程，记录当前页面URL:', sessionStorage.getItem('studyUrl'));
                }

                if (window.isAutoPlayEnabled) {
                    if (sessionStorage.getItem('currentChapterStatus') === 'in_progress' ||
                        sessionStorage.getItem('currentChapterStatus') === 'not_started') {
                        console.log('[自动播放] 当前页面为课程页面，自动播放已开启，尝试自动播放视频');
                        setTimeout(() => attemptAutoplay(), 1000);
                    } else {
                        console.log('[自动播放] 当前章节已完成，查找下一个未完成章节');
                        jumpToFirstIncompleteChapter();
                    }
                } else {
                    console.log('[自动播放] 自动播放模式已关闭，不执行自动播放');
                }
            }
            // 2. 处理章节练习页面
            else if (isExercisePage()) {
                console.log('[页面处理] 当前页面为章节练习页面，尝试返回课程页面');
                const studyUrl = sessionStorage.getItem('studyUrl');

                if (studyUrl) {
                    console.log('[页面处理] 返回课程页面:', studyUrl);
                    window.location.href = studyUrl;
                } else {
                    console.log('[页面处理] 未找到课程页面URL，无法返回');
                }
            }
            // 3. 处理其他未知页面
            else {
                console.log('[页面处理] 未知页面，当前页面路径:', window.location.href);
                const studyUrl = sessionStorage.getItem('studyUrl');

                if (studyUrl) {
                    console.log('[页面处理] 尝试返回课程页面:', studyUrl);
                    window.location.href = studyUrl;
                }
            }
        });
    }
})();