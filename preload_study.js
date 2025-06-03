const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 发送视频状态
  sendVideoStatus: (status) => {
    try {
      const data = typeof status === 'string' ? status : JSON.stringify(status);
      ipcRenderer.send('video-status', data);
    } catch (error) {
      console.error('发送视频状态失败:', error);
    }
  },
  
  // 发送视频进度
  sendVideoProgress: (progress) => {
    try {
      ipcRenderer.send('video-progress', progress);
    } catch (error) {
      console.error('发送视频进度失败:', error);
    }
  },
  
  // 发送章节信息
  sendChapterInfo: (info) => {
    try {
      console.log('[章节获取] 收到章节信息:', info);
      // 确保数据是字符串格式
      const data = typeof info === 'string' ? info : JSON.stringify(info);
      console.log('[章节获取] 发送章节信息:', data);
      ipcRenderer.send('chapter-info', data);
    } catch (error) {
      console.error('发送章节信息失败:', error);
    }
  },
  
  // 发送状态更新
  sendStatus: (message) => {
    try {
      // 直接发送原始消息，main 进程会处理
      ipcRenderer.send('status-update', message);
    } catch (error) {
      console.error('发送状态更新失败:', error);
    }
  },
  
  // 发送章节完成消息
  sendChapterCompleted: () => {
    try {
      ipcRenderer.send('chapter-completed');
    } catch (error) {
      console.error('发送章节完成消息失败:', error);
    }
  },
  
  // 添加事件监听功能
  on: (channel, listener) => {
    if (channel === 'study-injector-ready') {
      ipcRenderer.on(channel, (event, ...args) => listener(...args));
    }
  }
});

// 监听自动播放模式变更
ipcRenderer.on('update-auto-play-mode', (event, enabled) => {
  try {
    window.isAutoPlayEnabled = enabled;
    console.log(`[自动播放] 模式已${enabled ? '开启' : '关闭'}`);
  } catch (error) {
    console.error('更新自动播放模式失败:', error);
  }
});

// 监听视频控制命令
ipcRenderer.on('video-control', (event, action) => {
  try {
    console.log(`[视频控制] 接收到控制命令: ${action}`);
    // 将命令传递给注入的脚本
    window.postMessage({ type: 'video-control', action }, '*');
  } catch (error) {
    console.error('处理视频控制命令失败:', error);
  }
});

// 注入视频监控脚本
window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.textContent = `
    // 等待jQuery加载完成
    const waitForJQuery = setInterval(() => {
      if (window.jQuery) {
        clearInterval(waitForJQuery);
        
        // 监控视频元素
        const observer = new MutationObserver((mutations) => {
          const video = document.querySelector('video');
          if (video) {
            video.addEventListener('timeupdate', () => {
              // 直接发送进度数据，不输出任何日志
              const progressData = {
                currentTime: Number(video.currentTime.toFixed(2)),
                duration: Number(video.duration.toFixed(2)),
                chapter: String(document.querySelector('.current-chapter')?.textContent || '未知章节')
              };
              window.electronAPI.sendVideoProgress(JSON.stringify(progressData));
            });
            
            // 监听视频播放状态变化
            video.addEventListener('play', () => {
              window.electronAPI.sendVideoStatus({ 
                status: '播放中', 
                chapter: document.querySelector('.current-chapter')?.textContent || '未知章节',
                fromControlButton: window.lastControlAction && window.lastControlAction.action === 'play' && 
                                  (Date.now() - window.lastControlAction.timestamp < 1000)
              });
            });
            
            video.addEventListener('pause', () => {
              window.electronAPI.sendVideoStatus({ 
                status: '暂停', 
                chapter: document.querySelector('.current-chapter')?.textContent || '未知章节',
                fromControlButton: window.lastControlAction && window.lastControlAction.action === 'pause' && 
                                  (Date.now() - window.lastControlAction.timestamp < 1000)
              });
            });
            
            video.addEventListener('ended', () => {
              window.electronAPI.sendVideoStatus({ 
                status: '已完成', 
                chapter: document.querySelector('.current-chapter')?.textContent || '未知章节'
              });
            });
            
            // 监听来自主进程的视频控制消息
            window.addEventListener('message', (event) => {
              if (event.data && event.data.type === 'video-control') {
                const { action } = event.data;
                console.log('[视频控制] 执行命令:', action);
                
                if (action === 'play') {
                  if (video.paused) {
                    video.play();
                  }
                } else if (action === 'pause') {
                  if (!video.paused) {
                    video.pause();
                  }
                }
              }
            });
            
            // 停止观察
            observer.disconnect();
          }
        });
        
        // 开始观察DOM变化
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      }
    }, 100);
  `;
  document.documentElement.appendChild(script);
}); 