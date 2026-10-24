# dshdesktop community builds

独立构建配方，不是 DeepSeek 官方发行或上游源码 fork。上游固定 `deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，产品 `0.2.1-rc.3`，社区版本默认 `0.2.1-rc.3.20261024.1`，App ID `com.leexiexie.dshdesktop`。

## 更新行为与显式社区补丁

上游 unsigned 已省略普通 electron-updater feed，但 Windows 没有公开配置关闭 mandatory update policy。经明确决定，本配方在自己的临时 checkout 应用 `scripts/apply-community-patch.mjs`，标识 `community-unsigned-no-policy-v1`。它只把 electron-builder 的 policy 选择改为 `unsigned ? undefined : resolveDesktopPolicyEnvironment(env)`，并将 package environment 的 policy 预检改为仅非 unsigned 执行。两处精确原文必须各出现一次，先验证全部再写入，版本变化或重复执行都失败。

上游 runtime 的 `resolveDesktopPolicyConfig(undefined)` 支持不查询政策，builder 的 beforePack 已对 undefined 提前返回。补丁使社区 unsigned 包没有 mandatory-policy 元数据，不填假 origin，不伪造服务响应，不修改认证、sandbox、签名验证、runtime inventory 或 smoke。signed 模式仍执行上游政策。构建记录明确标记补丁和 upstreamDirty，临时源码变更不是原始上游提交本身。包更新由 Scoop 管理。本配方不改动原始 `C:\code\deepseek-harness-build`；Scoop 清单在独立的 [scoop-personal](https://github.com/LeeXieXie/scoop-personal/blob/master/bucket/dshdesktop.json) 中维护。

## 本地入口

需要 Windows x64、PowerShell 7、Node 24.9+（major 24）、pnpm **11.28.5**、Git、tar、Python 3、Rust MSVC、Visual C++ Build Tools 和 Windows SDK。上游目录模式仍编译 installer UI helper DLL，但 `--dir` 不运行 NSIS 编译器或生成安装器。下载需要 npm、GitHub release assets 和 nodejs.org。

```powershell
cd C:\code\community-builds\deepseek-harness
pwsh -NoProfile -File ./scripts/build.ps1 -CheckOnly
pwsh -NoProfile -File ./scripts/build.ps1
```

`-CheckOnly` 仍会下载固定源和安装依赖。每次在当前盘符根目录建立 `dsh-build/<8位随机标识>/source`，以避开 Windows ConPTY DLL 路径限制，并保留失败目录用于诊断。完整入口执行 frozen install、配置/工具预检、`pnpm --dir apps/desktop run package:win:x64 --dir --unsigned --build-version VERSION`、上游 runtime/ASAR/payload/Host smoke、`build:check`，再制作 ZIP。失败立即停止，不绕过 smoke，不读取官方签名凭据或上传 COS。临时配置置于独立 config 目录，unsigned 不读取签名 secrets。

## CI 与交付

入口 `.github/workflows/windows.yml`，仅 `workflow_dispatch`，`windows-latest`、Node 24、pnpm 11.28.5、Python 3.12 和 Rust MSVC，预检 VS 工具。version 可留空使用 pin。`publish_draft` 默认 false，只有明确勾选且真实构建成功后，独立 release job 获得 contents:write 创建 draft prerelease，公开前由维护者审核并在 Release 记录验收范围。成功产物保存 14 天，失败打包日志保存 7 天。当前不自动跟随上游源码，不因 Scoop 定时检查自动重建。

首轮打包的 ConPTY 烟测因 Windows 过长 DLL 路径报错 206。改用盘符根目录短路径、保留全部烟测后，[40065258134 的 Windows build job](https://github.com/LeeXieXie/deepseek-harness/actions/runs/40065258134/job/120787040274) 成功完成 runtime inventory、ASAR/payload、ConPTY/Host smoke 和 `build:check`。该次流程的 Release job 因上传目录路径失败，不将整次流程称为成功；[恢复流程 40066861865](https://github.com/LeeXieXie/deepseek-harness/actions/runs/40066861865) 对原始产物执行全部 SHA256 校验并上传，未重新压缩 ZIP。

已公开 [v0.2.1-rc.3.20261024.1](https://github.com/LeeXieXie/deepseek-harness/releases/tag/v0.2.1-rc.3.20261024.1)，Windows x64 ZIP 为 401,996,208 字节，SHA256 `9a6fa842d68cffb5558d314fd142a31f54627f0d48baed8974b42f5e008f1003`。本机独立下载、哈希、Scoop 原生解压、EXE/Node/Python 架构与 runtime/许可文件校验通过。隔离 DSH_HOME 和 Electron user-data-dir 启动后观察到响应窗口及 Host；截图未可靠定位，未完成登录、模型会话、Computer Use 或完整 GUI 验收。启动有非致命 mandatory-status IPC handler 警告，见 Release 说明。此社区发布设为 latest 供 Scoop 检测，但明确包含上游 RC 代码，不代表稳定性保证。

`dist/VERSION/` 输出 `dshdesktop-VERSION-windows-x64.zip`、`SHA256SUMS`、`build-source.json`、`LICENSE`、`THIRD_PARTY_NOTICES`。ZIP 根直接是完整 win-unpacked，入口 `DeepSeek Harness.exe`，不需要 extract_dir。这是免安装 ZIP，不承诺用户数据也在该目录。完整保留 Electron、ASAR、app.asar.unpacked、primary-runtime、Node/Python、所有嵌套许可，不瘦身。额外许可与记录不改动封存 resources。

脚本检查关键文件、Python、无 app-update.yml 和 ZIP 文件数，上游 smoke 检查 runtime inventory、ASAR 和 Office 转换。发布前仍需检查实际启动及更新行为，任何未覆盖的 GUI、网络行为或功能必须如实披露，不把进程存在当作完整验收。unsigned 自有 EXE 可能触发 SmartScreen，不得冒充官方签名或要求关闭安全防护。

## Scoop 发布约定

真实构建后，维护者核查原始 ZIP、SHA256SUMS 和记录，审核启动情况并如实记录未验证项，再手动发布 `vVERSION` GitHub Release，禁止重新压缩 ZIP。Scoop 在社区仓库的 `/releases/latest` 页面显式匹配完整 tag，保留 RC、日期和社区构建号，不使用会截断后缀的 GitHub 默认版本正则。hash 使用 SHA256SUMS 中 ZIP 的 SHA256，不是 Actions 外层下载包。每版唯一，不复用已有版本或官方 desktop-v tag。脚本拒绝覆盖本地已有版本目录。

```powershell
scoop bucket add personal https://github.com/LeeXieXie/scoop-personal
scoop install personal/dshdesktop
scoop update dshdesktop
```

开始菜单入口为 `DeepSeek Harness`，与官方 Windows `productName` 一致，名称不再追加 `Desktop` 或 `Community`；Scoop 包名仍为 `dshdesktop`。

已安装旧名称快捷方式的用户，请先关闭应用，再依次执行以下命令以重建开始菜单入口。同版本的普通 `scoop update` 和 `scoop reset` 不会读取更新后的桶清单来重建现有名称：

```powershell
scoop update
scoop uninstall dshdesktop
scoop install personal/dshdesktop
```

卸载时不要加 `--purge`；上述操作不迁移或删除上游默认用户目录中的配置。不使用同版本强制更新更名，因为本机 Scoop 的该实现不会移除旧名称快捷方式，会留下旧链接。

便携包自带运行时，不另装或覆盖 `dsh` CLI，不迁移或删除用户配置。勿与共享默认数据目录的官方版同时运行。Scoop 仅跟踪此仓库今后公开的社区 Release，更新上游 pin 与触发新构建仍需维护者操作。

2026-10-24 另以未修改的真实 Scoop Core 和独立临时根目录完成用户路径验收：从远端 `scoop-personal` 执行 `bucket add personal`，使用已独立下载并验证的原始公开 ZIP 作为缓存，保留 Scoop 自身哈希检查，实际 `install personal/dshdesktop` 成功。安装记录与 `info` 均保留完整版本 `0.2.1-rc.3.20261024.1`、`personal` 来源及 x64 架构，`current` 指向真实 EXE/运行时；真实生成的开始菜单快捷方式目标和工作目录正确。`status --local` 返回 `Everything is ok!`，`update dshdesktop` 返回已是最新版，未生成 `dsh` CLI shim。随后真实 `uninstall dshdesktop` 成功，测试应用与快捷方式均移除，用户和系统 PATH、既有 Scoop 配置哈希均未变化。此验收证明 Scoop 安装/管理闭环，不扩展为账号、模型会话或完整 GUI 功能通过。

2026-10-24 的名称调整另做真实 Scoop 同版本迁移验收：先安装原清单并观察旧 `DeepSeek Harness Desktop (Community).lnk`，普通卸载后旧链接消失，再安装更新清单，观察仅生成 `DeepSeek Harness.lnk`，目标和工作目录正确，EXE `ProductName` 与 `scoop info` 均为 `DeepSeek Harness`。22 项生命周期断言通过，卸载后无新旧测试链接，既有 Scoop 配置哈希与用户/系统 PATH 不变。此调整没有重压缩或替换原始 ZIP。

## 许可与复现限制

根依赖安装锁定，但上游 runtime preparation 生成新 runtime lockfile，不保证不同日期构建字节可复现。记录包含实际 Node/pnpm、上游提交、版本、unsigned 和社区补丁。更新 pin 时重新审核补丁、资源布局和许可。

LICENSE 保留上游 MIT 全文，产物再从固定提交复制许可。第三方许可保留原路径，THIRD_PARTY_NOTICES 索引物理可见许可文件，ASAR 内原始许可仍保留，不将该索引宣称为完整法律清单。发布者负责审核再分发条款，名称和图标归各自权利人，MIT 不代表官方背书。
