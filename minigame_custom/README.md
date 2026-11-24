# 小游戏自定义文件源目录

这个目录保存的是**微信小游戏转换工具不会生成、但运行必需**的文件。
转换工具每次导出都会把 `D:\GitHub_Project\HYF_Puzzle\HYF_Puzzle_H5\minigame` 整个重建，
所以这些文件会消失。这里的副本是它们的"母版"，改代码请改这里（或改完再同步回来）。

## 这里有什么

| 文件 / 目录 | 作用 | 丢了会怎样 |
|---|---|---|
| `cloudfunctions/progressStorage/` | 云函数源码（存档、签到、提示、排行榜） | 开发者工具里看不到云函数，云端调用全靠线上旧版本 |
| `wx-cloud-progress-sync.js` | C# ↔ JS ↔ 微信云 的桥接层（签到、提示扣减、档案自愈、排行榜兜底） | 签到、提示、排行榜全部失效 |
| `open-data/` | 开放数据域（好友排行榜渲染） | 排行榜界面白屏 |
| `project.private.config.json` | 开发者工具本地私有配置 | 编译设置被重置 |

另外两个文件是**在导出产物里打补丁**（脚本自动处理，不用手工改）：
- `game.js` 需要一行 `import './wx-cloud-progress-sync';`
- `project.config.json` 需要 `"cloudfunctionRoot": "cloudfunctions/"`

## 导出后的标准流程

1. Unity 里点「生成并转换」，等待完成
2. 双击 `D:\GitHub_Project\HYF_Puzzle\tools\restore-minigame.bat`
3. 微信开发者工具里点「编译」，再预览 / 上传

脚本是幂等的，重复执行没有副作用。常用参数：

```powershell
# 自定义导出目录
restore-minigame.bat -Target "D:\其他路径\minigame"

# 顺便清理 data-package 里没被 game.js 引用的旧资源（防止包体积超 30MB）
restore-minigame.bat -CleanStale
```

## 改了代码怎么同步

在 `minigame` 里调试完、确认没问题后，把改动拷回这里，例如：

```powershell
Copy-Item "D:\GitHub_Project\HYF_Puzzle\HYF_Puzzle_H5\minigame\wx-cloud-progress-sync.js" "D:\GitHub_Project\HYF_Puzzle\minigame_custom\" -Force
Copy-Item "D:\GitHub_Project\HYF_Puzzle\HYF_Puzzle_H5\minigame\cloudfunctions\progressStorage\index.js" "D:\GitHub_Project\HYF_Puzzle\minigame_custom\cloudfunctions\progressStorage\" -Force
```

或者直接 `git add` 提交（这些文件都在 git 里跟踪，`git checkout` 也能恢复）。

## 改了云函数就必须重新部署（重点）

改完 `cloudfunctions/progressStorage/index.js` 后，双击：

```
D:\GitHub_Project\HYF_Puzzle\tools\deploy-cloudfunction.bat
```

它会用 **`--remote-npm-install`（云端安装依赖）** 部署，并自动下载线上包校验
`node_modules/wx-server-sdk` 是否就位。

⚠️ **千万不要手动用「只上传代码」的方式部署**：一旦不带依赖，线上函数会直接崩，
客户端表现为 **签到、档案、排行榜全部失败**，错误是：

```
errCode: -504002 functions execute fail
errMsg: Error: Cannot find module 'wx-server-sdk'
```

（2026-11-24 就是这么坏的：用 CLI 直接 deploy，没装依赖。）

## ⚠️ 不要运行旧脚本

`tools\restore_wechat_h5_patch.js` 是 11 月 16 日的旧方案，它把**旧版**的
`wx-cloud-progress-sync.js` 和云函数源码硬编码在脚本里。一旦运行，签到、提示扣减、
档案自愈、排行榜兜底这些修复会被**整体覆盖回滚**。已改名为
`restore_wechat_h5_patch.js.deprecated-旧版会覆盖新代码勿运行`，请勿使用，
也不需要删除（留着不影响构建）。

