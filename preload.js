const { contextBridge, ipcRenderer } = require('electron');

// 暴露 API 给主进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 单向发送
  sendStatus: (msg) => ipcRenderer.send('status-update', msg),
  sendCourseList: (courseList) => ipcRenderer.send('course-list-update', courseList),
  sendVideoProgress: (progress) => ipcRenderer.send('video-progress', progress),
  sendChapterInfo: (info) => ipcRenderer.send('chapter-info', info),
  sendCourseStudyClick: (data) => ipcRenderer.send('course-study-click', data),
  sendJumpToChapter: (url) => ipcRenderer.send('jump-to-chapter', url),
  sendToggleDevtools: (open) => ipcRenderer.send('toggle-devtools', open),
  sendAutoPlayMode: (enabled) => ipcRenderer.send('auto-play-mode', enabled),

  // 双向调用
  invokeLogin: (data) => ipcRenderer.invoke('login', data),
  invokeStartLearning: (data) => ipcRenderer.invoke('start-learning', data),

  // 事件监听
  on: (channel, listener) => ipcRenderer.on(channel, listener)
});

// 处理课程学习按钮点击
window.addEventListener('DOMContentLoaded', () => {
  // 重写 gotoxx 函数
  window.gotoxx = function(is_sp, kcdm) {
    console.log('gotoxx 被调用:', { is_sp, kcdm });
    if (is_sp == 1) {
      // 发送消息到主进程
      ipcRenderer.send('course-study-click', kcdm);
      // 发送状态更新
      ipcRenderer.send('status-update', `正在打开课程 ${kcdm} 的学习页面...`);
    } else {
      alert('本课程正在更新中，请稍后再来学习！');
    }
  };
}); 