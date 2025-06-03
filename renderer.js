let logs = [];
let currentCourseName = '';
let currentSemester = '';
let studyTimeRange = '';
window.chapterListCache = null; // 添加全局章节列表缓存
const logEntries = document.getElementById('logEntries');
const copyLogButton = document.getElementById('copyLogButton');
const pauseLogButton = document.getElementById('pauseLogButton');
const clearLogButton = document.getElementById('clearLogButton');
let isLogPaused = false;
const pausedLogMessages = [];

// 自动播放开关控制
const autoPlayCheckbox = document.getElementById('autoPlayCheckbox');
const autoPlaySlider = document.getElementById('autoPlaySlider');
const autoPlayCircle = document.getElementById('autoPlayCircle');
autoPlayCheckbox.checked = true; // 默认开启

function addLog(message) {
    if (isLogPaused && message.includes('sendVideoProgress')) {
        return;
    }
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    logs.push(logEntry);
    if (!isLogPaused) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        entry.textContent = logEntry;
        logEntries.appendChild(entry);
        logEntries.scrollTop = logEntries.scrollHeight;
    } else {
        pausedLogMessages.push(logEntry);
    }
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberPassword = document.getElementById('rememberPassword').checked;
    
    // 如果选择了记住密码，保存到 localStorage
    if (rememberPassword) {
        localStorage.setItem('rememberedUsername', username);
        localStorage.setItem('rememberedPassword', password);
        localStorage.setItem('rememberPassword', 'true');
    } else {
        // 如果没有选择记住密码，清除保存的信息
        localStorage.removeItem('rememberedUsername');
        localStorage.removeItem('rememberedPassword');
        localStorage.removeItem('rememberPassword');
    }
    
    addLog(`尝试登录，用户名：${username}`);
    try {
        const result = await window.electronAPI.invokeLogin({ username, password });
        if (result.success) {
            addLog('登录成功');
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('userInfo').style.display = 'block';
            if (result.studentName) {
                document.getElementById('userName').textContent = result.studentName;
                addLog(`欢迎，${result.studentName}`);
            }
            const incompleteCourses = result.courses;
            const courseList = document.getElementById('courseList');
            courseList.innerHTML = '';
            // 只从result.currentSemester赋值currentSemester
            if (result.currentSemester) {
                currentSemester = result.currentSemester;
            } else {
                currentSemester = '获取学期失败';
            }
            
            // 保存学习时间段信息
            if (result.studyTimeRange) {
                studyTimeRange = result.studyTimeRange;
            }
            
            // 显示当前学期和学习时间段
            const currentSemesterElement = document.getElementById('currentSemester');
            if (currentSemesterElement) {
                let semesterText = currentSemester ? `当前学期：${currentSemester}` : '';
                if (studyTimeRange) {
                    semesterText += ` （学习时间段：${studyTimeRange}）`;
                }
                currentSemesterElement.textContent = semesterText;
            }
            incompleteCourses.forEach(course => {
                const courseItem = document.createElement('div');
                courseItem.className = 'course-item';
                courseItem.style.cursor = 'pointer';
                
                // 构建课程标签，包括重修标记和学期信息
                let courseLabel = `${course.name}`;
                if (course.isRetake) {
                    courseLabel += ' <span class="retake-badge">重修</span>';
                }
                
                courseItem.innerHTML = `
                    <div class="course-info course-info-flex">
                        <div class="course-name-box">
                            <span class="course-name">${courseLabel}</span>
                            <div class="course-semester">第${course.semester}学期</div>
                        </div>
                        <div class="score-composition-box">
                            ${formatScoreComposition(course.scoreComposition)}
                        </div>
                        <div class="course-score-box">
                            <span class="course-score">${course.totalScore}</span>
                        </div>
                    </div>
                `;
                courseItem.addEventListener('click', () => {
                    handleCourseClick(course);
                });
                courseList.appendChild(courseItem);
            });
            addLog(`找到 ${incompleteCourses.length} 门课程（当前学期和重修）`);
        } else {
            addLog(`登录失败：${result.error}`);
        }
    } catch (error) {
        addLog(`登录出错：${error.message}`);
    }
}

function copyLogs() {
    const logText = logs.join('\n');
    navigator.clipboard.writeText(logText).then(() => {
        const copyStatus = document.getElementById('copyStatus');
        copyStatus.style.display = 'block';
        setTimeout(() => {
            copyStatus.style.display = 'none';
        }, 2000);
    });
}

document.getElementById('loginButton').addEventListener('click', login);
copyLogButton.addEventListener('click', copyLogs);

window.electronAPI.on('status-update', (event, message) => {
    addLog(message);
});

addLog('应用已启动');

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 初始化播放控制按钮
document.addEventListener('DOMContentLoaded', () => {
    const playButton = document.getElementById('playButton');
    const pauseButton = document.getElementById('pauseButton');
    
    if (playButton && pauseButton) {
        // 默认显示播放按钮，隐藏暂停按钮
        playButton.style.display = 'flex';
        pauseButton.style.display = 'none';
        
        playButton.addEventListener('click', () => {
            window.electronAPI.sendVideoControl('play');
            addLog('[控制] 发送播放命令');
            // 标记此次状态更新来自控制按钮
            window.lastControlAction = {
                action: 'play',
                timestamp: Date.now()
            };
            
            // 立即更新按钮状态，提供更好的用户反馈
            playButton.style.display = 'none';
            pauseButton.style.display = 'flex';
            
            // 立即更新章节状态
            if (window.chapterListCache) {
                const chapters = window.chapterListCache.chapters;
                if (Array.isArray(chapters)) {
                    const currentChapter = chapters.find(ch => ch.isCurrent);
                    if (currentChapter) {
                        currentChapter.playStatus = '播放中';
                        renderChapterList(chapters, window.chapterListCache.currentChapter);
                    }
                }
            }
        });
        
        pauseButton.addEventListener('click', () => {
            window.electronAPI.sendVideoControl('pause');
            addLog('[控制] 发送暂停命令');
            // 标记此次状态更新来自控制按钮
            window.lastControlAction = {
                action: 'pause',
                timestamp: Date.now()
            };
            
            // 立即更新按钮状态，提供更好的用户反馈
            playButton.style.display = 'flex';
            pauseButton.style.display = 'none';
            
            // 立即更新章节状态
            if (window.chapterListCache) {
                const chapters = window.chapterListCache.chapters;
                if (Array.isArray(chapters)) {
                    const currentChapter = chapters.find(ch => ch.isCurrent);
                    if (currentChapter) {
                        currentChapter.playStatus = '暂停';
                        renderChapterList(chapters, window.chapterListCache.currentChapter);
                    }
                }
            }
        });
    }

    // 检查是否有保存的登录信息
    const rememberedUsername = localStorage.getItem('rememberedUsername');
    const rememberedPassword = localStorage.getItem('rememberedPassword');
    const rememberPassword = localStorage.getItem('rememberPassword');
    
    if (rememberPassword === 'true' && rememberedUsername && rememberedPassword) {
        document.getElementById('username').value = rememberedUsername;
        document.getElementById('password').value = rememberedPassword;
        document.getElementById('rememberPassword').checked = true;
    }
});

window.electronAPI.on('video-status', (event, status) => {
    console.log('[前端] 收到video-status事件', status);
    const playbackStatus = document.getElementById('playbackStatus');
    if (!playbackStatus) console.log('[前端] 未找到playbackStatus节点');
    playbackStatus.classList.add('active');
    const statusText = document.getElementById('playbackStatusText');
    if (!statusText) console.log('[前端] 未找到playbackStatusText节点');
    if (statusText) {
        if (window.statusUpdateTimer) {
            clearTimeout(window.statusUpdateTimer);
        }
        window.statusUpdateTimer = setTimeout(() => {
            statusText.textContent = status.status;
            console.log('[前端] 更新状态文本为:', status.status);
            
            // 根据视频状态更新按钮显示
            const playButton = document.getElementById('playButton');
            const pauseButton = document.getElementById('pauseButton');
            
            if (playButton && pauseButton) {
                if (status.status === '播放中') {
                    playButton.style.display = 'none';
                    pauseButton.style.display = 'flex';
                } else if (status.status === '暂停' || status.status === '等待开始' || status.status === '已完成') {
                    playButton.style.display = 'flex';
                    pauseButton.style.display = 'none';
                }
            }
            
            // 更新章节的播放状态
            if (status.chapter && window.chapterListCache) {
                const chapters = window.chapterListCache.chapters;
                if (Array.isArray(chapters)) {
                    // 找到当前章节
                    const currentChapter = chapters.find(ch => ch.isCurrent);
                    if (currentChapter) {
                        // 更新playStatus属性
                        currentChapter.playStatus = status.status;
                        // 重新渲染章节列表
                        renderChapterList(chapters, window.chapterListCache.currentChapter);
                    }
                }
            }
        }, 100);
    }
    
    // 避免重复记录日志，检查是否来自控制按钮的操作
    if (status && typeof status.status === 'string' && !status.fromControlButton) {
        if (status.status === '播放中') {
            if (status.chapter && status.chapter !== '未知章节') {
                addLog('[视频播放] 正在播放: ' + currentCourseName + ' ' + status.chapter);
            } else {
                addLog('[视频播放] 正在初始化章节信息，请稍候...');
            }
        } else if (status.status === '暂停') {
            addLog('[视频播放] 暂停播放: ' + currentCourseName + ' ' + (status.chapter ? status.chapter : ''));
        } else if (status.status === '已完成') {
            addLog('[视频播放] 停止播放: ' + currentCourseName + ' ' + (status.chapter ? status.chapter : ''));
        }
    }
});
window.electronAPI.on('video-progress', (event, progress) => {
    console.log('[前端] 收到video-progress事件', progress);
    const playbackStatus = document.getElementById('playbackStatus');
    if (!playbackStatus) console.log('[前端] 未找到playbackStatus节点');
    playbackStatus.classList.add('active');
    const progressText = document.getElementById('playbackProgress');
    const timeText = document.getElementById('playbackTime');
    const progressBar = document.getElementById('playbackProgressBar');
    if (!progressText) console.log('[前端] 未找到playbackProgress节点');
    if (!timeText) console.log('[前端] 未找到playbackTime节点');
    if (!progressBar) console.log('[前端] 未找到playbackProgressBar节点');

    let percent = 0;
    if (typeof progress.currentTime === 'number' && typeof progress.duration === 'number' && progress.duration > 0) {
        percent = Math.floor((progress.currentTime / progress.duration) * 100);
    }
    if (progressText) progressText.textContent = percent + '%';
    if (timeText) timeText.textContent = `播放时间：${formatTime(progress.currentTime)} / ${formatTime(progress.duration)}`;
    if (progressBar) progressBar.style.width = percent + '%';
});
window.electronAPI.on('chapter-info', (event, info) => {
    let chapterInfo = typeof info === 'string' ? JSON.parse(info) : info;
    currentCourseName = chapterInfo.courseName || '';
    console.log('[前端] 收到chapter-info事件', chapterInfo);
    
    // 更新全局章节列表缓存
    window.chapterListCache = {
        chapters: chapterInfo.chapters || [],
        currentChapter: chapterInfo.currentChapter || ''
    };
    
    const playbackStatus = document.getElementById('playbackStatus');
    if (!playbackStatus) console.log('[前端] 未找到playbackStatus节点');
    playbackStatus.classList.add('active');
    const chapterText = document.getElementById('currentPlaybackChapter');
    if (!chapterText) console.log('[前端] 未找到currentPlaybackChapter节点');
    if (chapterText) {
        chapterText.textContent = `当前章节：${chapterInfo.currentChapter || '未开始'} (${chapterInfo.totalChapters || 0} 章)`;
        const userNameElement = document.getElementById('userName');
        if (userNameElement && chapterInfo.studentName) {
             userNameElement.textContent = chapterInfo.studentName;
        }
    }
    // 只显示currentSemester，不再显示章节学期
    const currentSemesterElement = document.getElementById('currentSemester');
    if (currentSemesterElement) {
        let semesterText = currentSemester ? `当前学期：${currentSemester}` : '';
        if (studyTimeRange) {
            semesterText += ` （学习时间段：${studyTimeRange}）`;
        }
        currentSemesterElement.textContent = semesterText;
    }
    const logMessage = `[章节获取] 当前课程：${chapterInfo.courseName || '未知课程'}，共 ${chapterInfo.totalChapters || 0} 章`;
    if (chapterInfo.courseName && chapterInfo.totalChapters > 0) {
        addLog(logMessage);
    }
    const chaptersContainer = document.getElementById('playbackChapterList');
    if (!chaptersContainer) console.log('[前端] 未找到playbackChapterList节点');
    if (Array.isArray(chapterInfo.chapters) && chapterInfo.chapters.length > 0) {
        renderChapterList(chapterInfo.chapters, chapterInfo.currentChapter);
    } else {
        renderChapterList([], '');
    }
});

function handleCourseClick(course) {
    document.querySelectorAll('.course-item').forEach(item => {
        item.classList.remove('active');
    });
    const courseElement = event?.currentTarget;
    if (courseElement) courseElement.classList.add('active');
    addLog(`点击课程：${course.name} (${course.code})`);
    if (course.studyOnclick) {
        try {
            const onclickMatch = course.studyOnclick.match(/gotoxx\('([\d]+)','([^']+)'\)/);
            if (onclickMatch) {
                const is_sp = onclickMatch[1];
                const kcdm = onclickMatch[2];
                addLog(`执行学习按钮点击事件：gotoxx(${is_sp}, ${kcdm})`);
                window.electronAPI.sendCourseStudyClick({
                    is_sp,
                    kcdm,
                    courseName: course.name
                });
            } else {
                addLog('无法解析学习按钮的点击事件');
            }
        } catch (error) {
            addLog(`执行学习按钮点击事件出错：${error.message}`);
        }
    } else {
        addLog(`课程 ${course.name} 没有可用的学习按钮`);
    }
}

function renderChapterList(chapters, currentChapter) {
    console.log('渲染章节列表:', chapters, currentChapter);
    const chapterList = document.getElementById('playbackChapterList');
    chapterList.innerHTML = '';
    if (!chapters || chapters.length === 0) {
        chapterList.innerHTML = '<div class="chapter-list-empty">暂无章节信息</div>';
        return;
    }
    chapters.forEach((chapter, index) => {
        const chapterItem = document.createElement('div');
        chapterItem.className = 'chapter-item';
        if (chapter.isCompleted) {
            chapterItem.classList.add('completed');
        } else if (chapter.color === '#FF8000' || chapter.color === 'rgb(255, 128, 0)') {
            chapterItem.classList.add('in-progress');
        } else {
            chapterItem.classList.add('not-started');
        }
        if (chapter.isCurrent) {
            chapterItem.classList.add('current');
        }
        // 优先显示playStatus
        let statusText = '';
        let statusColor = '';
        if (chapter.playStatus === '播放中') {
            statusText = '播放中';
            statusColor = '#2196F3';
        } else if (chapter.playStatus === '暂停') {
            statusText = '暂停';
            statusColor = '#FF8000';
        } else if (chapter.playStatus === '已完成') {
            statusText = '已完成';
            statusColor = '#00A600';
        } else if (chapter.isCurrent) {
            // 当前章节但没有播放状态时，显示为"当前章节"而不是"正在播放"
            statusText = '当前章节';
            statusColor = '#2196F3';
        } else if (chapter.status === 'in_progress') {
            statusText = '进行中';
            statusColor = '#FF8000';
        } else if (chapter.status === 'not_started') {
            statusText = '未开始';
            statusColor = '#EA0000';
        } else if (chapter.status === 'completed') {
            statusText = '已完成';
            statusColor = '#00A600';
        }
        chapterItem.innerHTML = `
            <div class="chapter-item-row">
                <span>${index + 1}. ${chapter.title}</span>
                <span class="chapter-status-text">${statusText}</span>
            </div>
        `;
        // 动态设置状态颜色
        const statusSpan = chapterItem.querySelector('.chapter-status-text');
        if (statusSpan && statusColor) statusSpan.style.color = statusColor;
        chapterItem.onclick = () => {
            console.log('点击章节:', chapter.title, chapter.url);
            jumpToChapter(chapter.url);
        };
        chapterList.appendChild(chapterItem);
    });
}

function updateChapterList(chapters, currentChapter) {
    renderChapterList(chapters, currentChapter);
}

const devModeCheckbox = document.getElementById('devModeCheckbox');
const devModeSlider = document.getElementById('devModeSlider');
const devModeCircle = document.getElementById('devModeCircle');
devModeCheckbox.checked = false;
function updateDevModeSwitch() {
    if (devModeCheckbox.checked) {
        devModeSlider.style.backgroundColor = '#2196F3';
        devModeCircle.style.left = '21px';
    } else {
        devModeSlider.style.backgroundColor = '#ccc';
        devModeCircle.style.left = '3px';
    }
}
devModeCheckbox.addEventListener('change', function() {
    window.electronAPI.sendToggleDevtools(devModeCheckbox.checked);
    updateDevModeSwitch();
});
updateDevModeSwitch();

pauseLogButton.addEventListener('click', () => {
    isLogPaused = !isLogPaused;
    if (isLogPaused) {
        pauseLogButton.textContent = '恢复日志';
        pauseLogButton.style.backgroundColor = '#4CAF50';
        pauseLogButton.style.boxShadow = '0 2px 4px rgba(244, 67, 54, 0.2)';
    } else {
        pauseLogButton.textContent = '暂停日志';
        pauseLogButton.style.backgroundColor = '#f44336';
        pauseLogButton.style.boxShadow = 'none';
        pausedLogMessages.forEach(message => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            logEntry.textContent = message;
            logEntries.appendChild(logEntry);
        });
        pausedLogMessages.length = 0;
        logEntries.scrollTop = logEntries.scrollHeight;
    }
});

pauseLogButton.addEventListener('mouseover', () => {
    if (isLogPaused) {
        pauseLogButton.style.backgroundColor = '#45a049';
    } else {
        pauseLogButton.style.backgroundColor = '#d32f2f';
    }
});

pauseLogButton.addEventListener('mouseout', () => {
    if (isLogPaused) {
        pauseLogButton.style.backgroundColor = '#4CAF50';
    } else {
        pauseLogButton.style.backgroundColor = '#f44336';
    }
});

clearLogButton.addEventListener('click', () => {
    logs = [];
    logEntries.innerHTML = '';
    pausedLogMessages.length = 0;
    addLog('日志已清除');
});

clearLogButton.addEventListener('mouseover', () => {
    clearLogButton.style.backgroundColor = '#F57C00';
});

clearLogButton.addEventListener('mouseout', () => {
    clearLogButton.style.backgroundColor = '#FF9800';
});

copyLogButton.addEventListener('mouseover', () => {
    copyLogButton.style.backgroundColor = '#1976D2';
});

copyLogButton.addEventListener('mouseout', () => {
    copyLogButton.style.backgroundColor = '#2196F3';
});

window.electronAPI.on('log-message', (event, message) => {
    addLog(message);
});

window.electronAPI.on('login-success', (event, loginResult) => {
    addLog('登录成功！欢迎，' + loginResult.studentName);
});

window.electronAPI.on('login-failure', (event, message) => {
    addLog('登录失败：' + message);
});

function formatScoreComposition(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html || '';
    const rows = temp.querySelectorAll('.row');
    if (rows.length < 2) return '<span class="score-composition-empty">无成绩构成</span>';
    const ratioCells = rows[0].querySelectorAll('div');
    const ratios = Array.from(ratioCells).map(cell => cell.innerText.trim()).filter(Boolean);
    const scoreCells = rows[1].querySelectorAll('div');
    const scores = Array.from(scoreCells).map(cell => cell.innerText.trim()).filter(Boolean);
    let htmlStr = '<div class="score-composition-flex">';
    for (let i = 0; i < ratios.length; i++) {
        htmlStr += `
          <div class="score-composition-item">
            <div class="score-composition-ratio">${ratios[i]}</div>
            <div class="score-composition-score">${scores[i] || '-'}</div>
          </div>
        `;
    }
    htmlStr += '</div>';
    return htmlStr;
}

function jumpToChapter(url) {
    window.electronAPI.sendJumpToChapter(url);
}

function updateAutoPlaySwitch() {
    if (autoPlayCheckbox.checked) {
        autoPlaySlider.style.backgroundColor = '#4CAF50';
        autoPlayCircle.style.left = '21px';
        addLog('[设置] 自动播放模式已开启');
    } else {
        autoPlaySlider.style.backgroundColor = '#ccc';
        autoPlayCircle.style.left = '3px';
        addLog('[设置] 自动播放模式已关闭');
    }
    window.electronAPI.sendAutoPlayMode(autoPlayCheckbox.checked);
}

autoPlayCheckbox.addEventListener('change', updateAutoPlaySwitch);
updateAutoPlaySwitch(); 