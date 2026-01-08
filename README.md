# 点睛网学习助手

> 🚀 正风网校自动化学习工具 - 后台挂机，智能刷课

## ✨ 功能

- **8倍速播放** - 自动加速播放，快速完成学时
- **动态调速** - 进度接近完成时自动降速，避免频繁开关窗
- **短视频优化** - 时长<10分钟的课程自动降为2倍速
- **后台运行** - 页面切换到后台仍可继续播放
- **自动跳转** - 一讲完成后自动刷新，播放下一讲
- **弹窗处理** - 自动关闭"继续学习"、查岗等弹窗
- **多窗口防护** - 防止同时打开多个播放窗口

## 📦 安装

### 1. 安装 Tampermonkey

- [Chrome 扩展商店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- [Firefox 扩展商店](https://addons.mozilla.org/firefox/addon/tampermonkey/)

### 2. 安装脚本

**方法一：从 GitHub 自动更新（推荐）**

1. 点击 Tampermonkey 图标 → **添加新脚本**
2. 粘贴以下内容：

```javascript
// ==UserScript==
// @name         正风网校-后台挂机终结版
// @namespace    http://tampermonkey.net/
// @version      loader
// @match        *://*.zfwx.com/*
// @grant        unsafeWindow
// @run-at       document-start
// @description  从GitHub自动加载最新版本
// @require      https://raw.githubusercontent.com/edica02/DianJingWang/master/%E6%AD%A3%E9%A3%8E%E7%BD%91%E6%A0%A1.js
// ==/UserScript==
```

3. 按 `Ctrl+S` 保存

**方法二：手动安装**

复制 [正风网校.js](./正风网校.js) 的全部内容到 Tampermonkey 编辑器中。

## 🎮 使用

1. 登录 [正风网校](https://www.zfwx.com)
2. 进入 **我的学习** → **听课中心** (需要提前选课[购买课程]）
3. 脚本会自动：
   - 展开所有课程
   - 找到第一个未完成的课程
   - 打开播放窗口
   - 设置倍速播放
   - 完成后自动关闭，刷新页面，找下一个

4. 右上角会显示控制面板，显示当前状态

## ⚙️ 配置

可在脚本中修改 `CONFIG` 对象：

```javascript
const CONFIG = {
    targetSpeed: 8.0,           // 默认倍速
    shortVideoDuration: 600,    // 短视频阈值（秒）
    shortVideoSpeed: 2.0,       // 短视频倍速
    heartbeatTimeout: 60000,    // 心跳超时（毫秒）
    // ...
};
```

## ⚠️ 免责声明

本工具仅供学习交流使用。使用本工具产生的任何后果由用户自行承担。

## 📝 更新日志

- **V15.2** - 短视频优化：时长<10分钟降为2倍速
- **V15.1** - 修复循环开关窗问题
- **V15.0** - 智能延迟 + 多窗口防护
- **V14.9** - 播放完毕后刷新页面获取最新进度
