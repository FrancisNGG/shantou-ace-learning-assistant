const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const cheerio = require('cheerio')
const fetch = require('node-fetch')
const fs = require('fs')

let mainWindow
let classWindow
let videoWindow
let sessionCookies = ''
let studyWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 1000,
    resizable: true, // 始终允许调整窗口大小
    webPreferences: {
      nodeIntegration: false, // 安全
      contextIsolation: true, // 安全
      webSecurity: true, // 安全
      allowRunningInsecureContent: false, // 安全
      preload: path.join(__dirname, 'preload.js')
    }
  })

  setCSPForWindow(mainWindow, 'file://')
  mainWindow.loadFile('index.html')
  // 仅开发环境下打开devtools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// 创建课程列表窗口
function createClassWindow(url, username, password, courseCode) {
  console.log('创建课程列表窗口，参数:', { url, username, courseCode });

  if (!courseCode) {
    console.error('课程编码为空');
    mainWindow.webContents.send('status-update', '错误：课程编码为空');
    return;
  }

  classWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // 隐藏课程列表窗口
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  setCSPForWindow(classWindow, url);

  // 仅开发环境下打开devtools
  if (process.env.NODE_ENV === 'development') {
    classWindow.webContents.openDevTools();
  }

  // 监听页面加载完成事件
  classWindow.webContents.on('did-finish-load', async () => {
    try {
      mainWindow.webContents.send('status-update', '页面加载完成，准备登录...');

      // 注入登录和课程获取脚本
      await classWindow.webContents.executeJavaScript(`
        (async function() {
          if (window.automationExecuted) {
            console.log('自动化脚本已执行过，跳过。');
            return;
          }
          window.automationExecuted = true;

          const targetCourseCode = "${courseCode}";
          console.log('自动化脚本开始执行，目标课程编码:', targetCourseCode);
          try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log('初始等待完成。');
            
            const usernameInput = document.querySelector('input[name="username"]') || document.querySelector('input[type="text"]');
            const passwordInput = document.querySelector('input[name="password"]') || document.querySelector('input[type="password"]');
            const submitButton = document.querySelector('input[type="submit"]') || Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('登录'));
            
            if (usernameInput && passwordInput && submitButton) {
              console.log('找到登录表单，准备登录...');
              usernameInput.value = "${username}";
              passwordInput.value = "${password}";
              submitButton.click();
              console.log('登录信息已提交。');
              window.electronAPI.sendStatus('登录信息已提交，等待页面加载...');
              await new Promise(resolve => setTimeout(resolve, 5000));
              console.log('登录后页面加载等待完成。');
            } else {
              console.log('未找到登录表单，假定已登录或页面结构不同。');
              window.electronAPI.sendStatus('未找到登录表单，尝试直接获取课程列表...');
              await new Promise(resolve => setTimeout(resolve, 3000));
              console.log('未找到登录表单时的页面加载等待完成。');
            }

            const courseTable = document.querySelector('table.table tbody');
            if (!courseTable) {
              console.log('当前页面似乎不是课程列表页，未找到课程表格。');
              window.electronAPI.sendStatus('未在当前页面找到课程列表。');
              return;
            }
            console.log('找到课程表格，准备获取课程列表...');
            window.electronAPI.sendStatus('找到课程列表，正在提取数据...');
            
            // 获取课程列表并过滤没有总成绩的课程
            const courseList = Array.from(courseTable.querySelectorAll('tr')).map(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length >= 10) {
                const courseCode = cells[0].textContent.trim();
                const courseName = cells[1].textContent.trim();
                const studyCell = cells[4];
                const practiceCell = cells[5];
                const testCell = cells[6];
                const totalScore = cells[7].textContent.trim();
                const scoreComposition = cells[8] ? cells[8].innerHTML.trim() : '';
                const type = cells[9].textContent.trim();
                
                if (courseCode && courseCode !== '课程编码') {
                  return {
                    code: courseCode,
                    name: courseName,
                    studyOnclick: studyCell ? (studyCell.querySelector('a') ? studyCell.querySelector('a').getAttribute('onclick') : '') : '',
                    practiceOnclick: practiceCell ? (practiceCell.querySelector('a') ? practiceCell.querySelector('a').getAttribute('onclick') : '') : '',
                    testOnclick: testCell ? (testCell.querySelector('a') ? testCell.querySelector('a').getAttribute('onclick') : '') : '',
                    totalScore: totalScore,
                    scoreComposition: scoreComposition,
                    type: type
                  };
                }
              }
              return null;
            }).filter(course => {
              if (!course) return false;
              const score = course.totalScore.trim();
              return score === '-' || score === '';
            });
            
            console.log('获取到未完成课程列表:', courseList);
            window.electronAPI.sendStatus('成功获取到 ' + courseList.length + ' 条未完成课程信息');
            
            // 发送课程列表到主窗口
            window.electronAPI.sendCourseList(courseList);

            // 自动点击目标课程的学习按钮
            if (targetCourseCode) {
              console.log('尝试查找并执行目标课程的学习按钮, 课程编码:', targetCourseCode);
              const targetCourse = courseList.find(course => course.code === targetCourseCode);
              if (targetCourse && targetCourse.studyOnclick) {
                console.log('找到目标课程的学习按钮, onclick:', targetCourse.studyOnclick);
                window.electronAPI.sendStatus('找到目标课程 ' + targetCourseCode + '，正在尝试打开学习页面...');
                try {
                  eval(targetCourse.studyOnclick);
                  console.log('已执行 onclick:', targetCourse.studyOnclick);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  console.log('onclick 执行后延迟结束。');
                } catch (error) {
                  console.error('执行 onclick 错误:', error);
                  window.electronAPI.sendStatus('执行学习按钮 onclick 错误: ' + error.message);
                }
              }
            }
          } catch (error) {
            console.error('自动化脚本执行错误:', error.message || error);
            window.electronAPI.sendStatus('自动化脚本执行错误: ' + (error.message || error));
            throw error;
          }
        })();
      `);
    } catch (error) {
      console.error('脚本注入错误:', error);
      mainWindow.webContents.send('status-update', '脚本注入错误: ' + error.message);
    }
  });

  // 监听控制台消息
  classWindow.webContents.on('console-message', (event, level, message) => {
    const url = classWindow.webContents.getURL();
    if (
      typeof message === 'string' &&
      message.includes('Electron Security Warning') &&
      !url.startsWith('file://') &&
      !url.includes('localhost')
    ) {
      return;
    }
    console.log(`课程窗口控制台: ${message}`);
    mainWindow.webContents.send('status-update', `${message}`);
  });

  // 监听课程窗口创建新的浏览器窗口事件
  classWindow.webContents.on('new-window', (event, url, frameName, disposition, options, additionalFeatures) => {
    event.preventDefault();
    console.log('课程窗口尝试打开新窗口:', { url, frameName, disposition });

    if (videoWindow && !videoWindow.isDestroyed()) {
      console.log('视频窗口已存在，关闭旧窗口。');
      videoWindow.close();
    }

    videoWindow = createVideoWindow(url);

    // 监听视频窗口的控制台消息
    videoWindow.webContents.on('console-message', (event, level, message) => {
      // 完全过滤掉视频进度相关的日志
      if (!message.includes('播放进度') &&
        !message.includes('currentTime') &&
        !message.includes('duration') &&
        !message.includes('DEBUG: CHECKING PROGRESS LOG')) {
        console.log(`视频窗口控制台: ${message}`);
        mainWindow.webContents.send('status-update', `${message}`);
      }
    });

    // 监听视频窗口的页面加载完成事件
    videoWindow.webContents.on('did-finish-load', () => {
      console.log('视频页面加载完成');
      // 不再需要注入额外脚本，由 createVideoWindow 函数处理
    });

    videoWindow.once('ready-to-show', () => {
      videoWindow.show();
    });

    console.log('正在加载视频页面URL:', url);
    mainWindow.webContents.send('status-update', '视频窗口已打开并加载课程。');
  });

  // 加载页面
  classWindow.loadURL(url);
}

function createVideoWindow(url) {
  const videoWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload_study.js')
    }
  });

  setCSPForWindow(videoWindow, url);

  // 设置SSL错误处理
  videoWindow.webContents.session.setCertificateVerifyProc((request, callback) => {
    callback(0); // 接受所有证书
  });

  // 配置请求头
  videoWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    details.requestHeaders['Accept'] = '*/*';
    details.requestHeaders['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';
    callback({ requestHeaders: details.requestHeaders });
  });

  // 仅开发环境下打开devtools
  if (process.env.NODE_ENV === 'development') {
    videoWindow.webContents.openDevTools();
  }
  
  // 监听页面加载完成事件，注入脚本
  videoWindow.webContents.on('did-finish-load', async () => {
    try {
      console.log('[视频窗口] 页面加载完成，注入 study_injector.js');
      const injectorScriptPath = path.join(__dirname, 'study_injector.js');
      const injectorScriptContent = fs.readFileSync(injectorScriptPath, 'utf8');
      await videoWindow.webContents.executeJavaScript(injectorScriptContent);
      // 触发脚本初始化
      videoWindow.webContents.send('study-injector-ready');
    } catch (error) {
      console.error('[视频窗口] 注入脚本错误:', error);
      mainWindow.webContents.send('status-update', `注入脚本时出错：${error.message}`);
    }
  });

  // 加载URL
  videoWindow.loadURL(url);

  return videoWindow;
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 处理开始学习请求
ipcMain.handle('start-learning', async (event, { url, username, password, courseCode }) => {
  try {
    createClassWindow(url, username, password, courseCode);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 处理课程列表更新
ipcMain.on('course-list-update', (event, courseList) => {
  mainWindow.webContents.send('update-course-list', courseList);
});

// 处理在课程窗口执行 onclick 代码的请求
ipcMain.on('execute-onclick', (event, onclickCode) => {
  console.log('收到执行 onclick 请求:', onclickCode);
  if (classWindow && !classWindow.isDestroyed()) {
    classWindow.webContents.executeJavaScript(onclickCode).catch(error => {
      console.error('在课程窗口执行 onclick 错误:', error);
      mainWindow.webContents.send('status-update', '执行 onclick 错误: ' + error.message);
    });
  } else {
    console.warn('课程窗口不存在或已被销毁，无法执行 onclick 代码。');
    mainWindow.webContents.send('status-update', '错误: 课程窗口不存在或已被销毁。');
  }
});

// 解析课程列表（只做DOM解析，不做业务过滤）
function parseCourses(html) {
  const courses = [];
  const $ = cheerio.load(html);
  $('table.table tbody tr').each((index, element) => {
    const cells = $(element).find('td');
    if (cells.length >= 10) {
      const course = {
        code: $(cells[0]).text().trim(),
        name: $(cells[1]).text().trim(),
        semester: $(cells[2]).text().trim(),
        studyOnclick: $(cells[4]).find('a').attr('onclick') || '',
        practiceOnclick: $(cells[5]).find('a').attr('onclick') || '',
        testOnclick: $(cells[6]).find('a').attr('onclick') || '',
        totalScore: $(cells[7]).text().trim(),
        scoreComposition: $(cells[8]).html().trim(),
        type: $(cells[9]).text().trim(),
        isRetake: $(cells[10]).text().includes('重修')
      };
      if (course.code && course.code !== '课程编码') {
        courses.push(course);
      }
    }
  });
  return courses;
}

// 新增：从课程表格顶部h6提取当前学期
function extractCurrentSemester(html) {
  const $ = cheerio.load(html);
  const h6 = $('h6').text();
  const match = h6.match(/当前学期[:：]?([第\d]+学期)/);
  if (match && match[1]) {
    return match[1];
  }
  return '';
}

// 过滤课程：只显示当前学期或重修的课程
function filterIncompleteCourses(courses, currentSemester) {
  // 从当前学期字符串中提取学期数字
  const currentSemesterNumber = currentSemester ? currentSemester.match(/\d+/)[0] : '';
  
  return courses.filter(course => {
    // 检查是否是当前学期或重修课程
    const isCurrentSemester = course.semester === currentSemesterNumber;
    const isRetake = course.isRetake;
    
    // 检查是否有有效按钮
    const hasValidBtn = !!(course.studyOnclick || course.practiceOnclick || course.testOnclick);
    
    // 只返回当前学期或重修的课程，并且必须有有效按钮
    return (isCurrentSemester || isRetake) && hasValidBtn;
  });
}

// 添加提取学员姓名的函数
function extractStudentName(html) {
  const $ = cheerio.load(html);
  const nameNode = $('.sidebar-mini-hidden-b .list-inline-item a[href="user_s.php"]');
  if (nameNode.length > 0) {
    const match = nameNode.text().match(/学员：(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

// 处理课程学习按钮点击
ipcMain.on('course-study-click', async (event, { is_sp, kcdm, courseName }) => {
  mainWindow.webContents.send('status-update', `正在获取课程内容：${courseName} (${kcdm})`);

  try {
    // 创建隐藏的浏览器窗口来加载课程页面
    if (studyWindow && !studyWindow.isDestroyed()) {
      studyWindow.close();
    }

    studyWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        preload: path.join(__dirname, 'preload_study.js')
      }
    });

    // 监听页面加载完成事件
    studyWindow.webContents.on('did-finish-load', async () => {
      try {
        mainWindow.webContents.send('status-update', `[页面处理] 课程页面加载完成：${courseName}`);
        // 读取并注入外部脚本文件
        const injectorScriptPath = path.join(__dirname, 'study_injector.js');
        const injectorScriptContent = fs.readFileSync(injectorScriptPath, 'utf8');
        // 在执行前替换掉模板字符串中的变量
        const formattedScriptContent = injectorScriptContent.replace(/\$\{courseName\}/g, courseName);
        await studyWindow.webContents.executeJavaScript(formattedScriptContent);
        // 这里创建一个事件给study_injector.js调用
        studyWindow.webContents.send('study-injector-ready');
      } catch (error) {
        mainWindow.webContents.send('status-update', `注入脚本时出错：${error.message}`);
        console.error('注入脚本错误:', error);
      }
    });

    // 监听控制台消息
    studyWindow.webContents.on('console-message', (event, level, message) => {
      const url = studyWindow.webContents.getURL();
      if (
        typeof message === 'string' &&
        message.includes('Electron Security Warning') &&
        !url.startsWith('file://') &&
        !url.includes('localhost')
      ) {
        return;
      }
      console.log(`课程窗口控制台: ${message}`);
      mainWindow.webContents.send('status-update', `${message}`);
    });

    // 加载课程页面
    const studyUrl = `https://stu.5zk.com.cn/zk8exam/jp_wiki_study.php?kcdm=${kcdm}&is_sp=${is_sp}`;
    mainWindow.webContents.send('status-update', `正在访问课程页面：${studyUrl}`);

    // 设置请求头
    studyWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          'Cookie': sessionCookies,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': 'https://stu.5zk.com.cn/zk8exam/mycourse.php'
        }
      });
    });

    await studyWindow.loadURL(studyUrl);

  } catch (error) {
    mainWindow.webContents.send('status-update', `获取课程内容失败：${error.message}`);
    console.error('获取课程内容错误:', error);
  }
});

ipcMain.on('video-status', (event, status) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const parsedStatus = typeof status === 'string' ? JSON.parse(status) : status;
      mainWindow.webContents.send('video-status', parsedStatus);
    } catch (error) {
      console.error('解析视频状态数据失败:', error);
    }
  }
});

ipcMain.on('video-progress', (event, progress) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const parsedProgress = typeof progress === 'string' ? JSON.parse(progress) : progress;
      mainWindow.webContents.send('video-progress', parsedProgress);
    } catch (error) {
      console.error('解析视频进度数据失败:', error);
    }
  }
});

/**
 * 处理从渲染进程接收到的章节信息
 * 接收来自 study_injector.js 的章节数据，并转发给主窗口
 */
ipcMain.on('chapter-info', (event, info) => {
  console.log('[主进程] 收到章节信息');
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      // 确保数据是字符串格式
      const data = typeof info === 'string' ? info : JSON.stringify(info);
      
      // 转发章节信息到主窗口
      mainWindow.webContents.send('chapter-info', data);
      console.log('[主进程] 章节信息已转发到主窗口');
    } catch (error) {
      console.error('处理章节信息失败:', error);
    }
  }
});

ipcMain.on('jump-to-chapter', (event, url) => {
  console.log('[主进程] 收到跳转章节请求:', url);
  if (studyWindow && !studyWindow.isDestroyed()) {
    console.log('[主进程] 复用已存在的studyWindow，跳转到新章节');
    studyWindow.loadURL(url);
  } else {
    console.log('[主进程] studyWindow不存在，新建并跳转');
    studyWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        preload: path.join(__dirname, 'preload_study.js')
      }
    });
    studyWindow.loadURL(url);
    // 监听页面加载完成事件，注入脚本
    studyWindow.webContents.on('did-finish-load', async () => {
      try {
        const injectorScriptPath = path.join(__dirname, 'study_injector.js');
        const injectorScriptContent = fs.readFileSync(injectorScriptPath, 'utf8');
        await studyWindow.webContents.executeJavaScript(injectorScriptContent);
      } catch (error) {
        mainWindow.webContents.send('status-update', `注入脚本时出错：${error.message}`);
        console.error('注入脚本错误:', error);
      }
    });
  }
});

ipcMain.on('toggle-devtools', (event, open) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (open) {
      mainWindow.setSize(1280, 1000); // 临时增宽
      mainWindow.webContents.openDevTools({ mode: 'right' });
    } else {
      mainWindow.setSize(600, 1000); // 恢复
      mainWindow.webContents.closeDevTools();
    }
  }
});

ipcMain.on('status-update', (event, message) => {
  console.log(`状态更新: ${message}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    // 假设 message 已经是准备好的状态数据（对象或字符串）
    // 如果前端需要一个对象，并且 preload 中已经处理，这里直接转发
    // 如果 message 是一个简单的字符串状态，前端也需要相应调整
    // 考虑到前端 video-status 监听器期望 status.status，我们继续发送对象结构
    let statusData = message;
    if (typeof message === 'string') {
      try {
        statusData = JSON.parse(message);
      } catch (e) {
        statusData = { status: message }; // 如果解析失败，封装成对象
      }
    }
    // 确保发送的是一个对象，且包含 status 属性
    if (typeof statusData !== 'object' || statusData === null || !('status' in statusData)) {
      statusData = { status: String(message) }; // 兜底处理，确保是 { status: '...' }
    }
    mainWindow.webContents.send('video-status', statusData);
  }
});

// login handle 处调用
ipcMain.handle('login', async (event, { username, password }) => {
  try {
    mainWindow.webContents.send('status-update', '正在连接登录页面...');

    // 第一步：获取登录页面，获取初始Cookie
    const loginPageResponse = await fetch('https://stu.5zk.com.cn/zk8exam/login.php');
    const cookies = loginPageResponse.headers.get('set-cookie');
    if (cookies) {
      sessionCookies = cookies;
    }

    mainWindow.webContents.send('status-update', '正在执行登录...');

    // 第二步：执行登录
    const loginResponse = await fetch('https://stu.5zk.com.cn/zk8exam/check_login.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': sessionCookies
      },
      body: `admin_name=${username}&admin_password=${password}&s_or_t=1`
    });

    const loginText = await loginResponse.text();
    const newCookies = loginResponse.headers.get('set-cookie');
    if (newCookies) {
      sessionCookies = newCookies;
    }

    if (loginText.includes('mycourse.php')) {
      mainWindow.webContents.send('status-update', '登录成功，正在获取课程列表...');
      // 登录成功，获取课程列表
      const courseResponse = await fetch('https://stu.5zk.com.cn/zk8exam/mycourse.php', {
        headers: {
          'Cookie': sessionCookies
        }
      });
      const courseHtml = await courseResponse.text();
      // 解析课程列表
      const allCourses = parseCourses(courseHtml);
      const currentSemester = extractCurrentSemester(courseHtml);
      const studyTimeRange = extractStudyTimeRange(courseHtml);
      const incompleteCourses = filterIncompleteCourses(allCourses, currentSemester);
      // 获取学员姓名
      const userResponse = await fetch('https://stu.5zk.com.cn/zk8exam/user_s.php', {
        headers: {
          'Cookie': sessionCookies
        }
      });
      const userHtml = await userResponse.text();
      const studentName = extractStudentName(userHtml);
      mainWindow.webContents.send('status-update', `成功获取到 ${allCourses.length} 门课程`);
      return {
        success: true,
        courses: incompleteCourses,
        studentName: studentName,
        currentSemester: currentSemester,
        studyTimeRange: studyTimeRange
      };
    } else {
      mainWindow.webContents.send('status-update', '登录失败：用户名或密码错误');
      return {
        success: false,
        error: '用户名或密码错误'
      };
    }
  } catch (error) {
    mainWindow.webContents.send('status-update', `登录过程出错：${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
});

// 全局CSP自动补全函数
function setCSPForWindow(win, url) {
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('file://') || details.url.includes('localhost')) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https:;"
          ]
        }
      });
    } else {
      callback({ responseHeaders: details.responseHeaders });
    }
  });
}

// 处理自动播放模式切换
ipcMain.on('auto-play-mode', (event, enabled) => {
  console.log('收到自动播放模式切换请求:', enabled);
  mainWindow.webContents.send('status-update', `自动播放模式已${enabled ? '开启' : '关闭'}`);

  // 如果视频窗口存在，则向视频窗口发送自动播放模式更新
  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.webContents.send('update-auto-play-mode', enabled);
  }

  // 如果学习窗口存在，则向学习窗口发送自动播放模式更新
  if (studyWindow && !studyWindow.isDestroyed()) {
    studyWindow.webContents.send('update-auto-play-mode', enabled);
  }
});

// 提取学习时间段信息
function extractStudyTimeRange(html) {
  const $ = cheerio.load(html);
  const timeRangeText = $('p[style*="color:red"]').first().text();
  const match = timeRangeText.match(/学习时间段：([^。]+)/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return '';
}