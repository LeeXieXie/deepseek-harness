# dshdesktop community builds

独立构建配方，不是 DeepSeek 官方发行或上游源码 fork。上游固定 `deepseek-ai/deepseek-harness@22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，产品 `0.2.1-rc.3`，社区版本默认 `0.2.1-rc.3.20261024.1`，App ID `com.leexiexie.dshdesktop`。

## 更新行为与显式社区补丁

上游 unsigned 已省略普通 electron-updater feed，但 Windows 没有公开配置关闭 mandatory update policy。经明确决定，本配方在自己的临时 checkout 应用 `scripts/apply-community-patch.mjs`，标识 `community-unsigned-no-policy-v1`。它只把 electron-builder 的 policy 选择改为 `unsigned ? undefined : resolveDesktopPolicyEnvironment(env)`，并将 package environment 的 policy 预检改为仅非 unsigned 执行。两处精确原文必须各出现一次，先验证全部再写入，版本变化或重复执行都失败。

上游 runtime 的 `resolveDesktopPolicyConfig(undefined)` 支持不查询政策，builder 的 beforePack 已对 undefined 提前返回。补丁使社区 unsigned 包没有 mandatory-policy 元数据，不填假 origin，不伪造服务响应，不修改认证、sandbox、签名验证、runtime inventory 或 smoke。signed 模式仍执行上游政策。构建记录明确标记补丁和 upstreamDirty，临时源码变更不是原始上游提交本身。包更新由 Scoop 管理。原始 `C:\code\deepseek-harness-build` 与 scoop-personal 均不改动。

## 本地入口

需要 Windows x64、PowerShell 7、Node 24.9+（major 24）、pnpm **11.28.5**、Git、tar、Python 3、Rust MSVC、Visual C++ Build Tools 和 Windows SDK。上游目录模式仍编译 installer UI helper DLL，但 `--dir` 不运行 NSIS 编译器或生成安装器。下载需要 npm、GitHub release assets 和 nodejs.org。

```powershell
cd C:\code\dshdesktop-releases
pwsh -NoProfile -File ./scripts/build.ps1 -CheckOnly
pwsh -NoProfile -File ./scripts/build.ps1
```

`-CheckOnly` 仍会下载固定源和安装依赖。每次在当前盘符根目录建立 `dsh-build/<8位随机标识>/source`，以避开 Windows ConPTY DLL 路径限制，并保留失败目录用于诊断。完整入口执行 frozen install、配置/工具预检、`pnpm --dir apps/desktop run package:win:x64 --dir --unsigned --build-version VERSION`、上游 runtime/ASAR/payload/Host smoke、`build:check`，再制作 ZIP。失败立即停止，不绕过 smoke，不读取官方签名凭据或上传 COS。临时配置置于独立 config 目录，unsigned 不读取签名 secrets。

## CI 与交付

入口 `.github/workflows/windows.yml`，仅 `workflow_dispatch`，`windows-latest`、Node 24、pnpm 11.28.5、Python 3.12 和 Rust MSVC，预检 VS 工具。version 可留空使用 pin。`publish_draft` 默认 false，只有明确勾选且真实构建成功后，独立 release job 获得 contents:write 创建 draft prerelease，仍需人工 GUI 验收后公开。仓库已创建并推送配方，真实 Actions 构建已启动。成功产物保存 14 天，失败打包日志保存 7 天。首次真实构建已在 [Actions](https://github.com/LeeXieXie/dshdesktop-releases/actions) 执行：runtime 的离线插件安装/移除、Node/Python 依赖以及 DOCX/XLSX/PPTX 转 PDF 检查通过；目录包的 ConPTY 烟测因 Windows 过长 DLL 路径报错 206。配方改用盘符根目录短路径 `dsh-build/<8位随机标识>/source` 后重试，保留完整烟测，不跳过失败验证。GUI 与 Scoop 验收尚未完成。

`dist/VERSION/` 输出 `dshdesktop-VERSION-windows-x64.zip`、`SHA256SUMS`、`build-source.json`、`LICENSE`、`THIRD_PARTY_NOTICES`。ZIP 根直接是完整 win-unpacked，入口 `DeepSeek Harness.exe`，不需要 extract_dir。这是免安装 ZIP，不承诺用户数据也在该目录。完整保留 Electron、ASAR、app.asar.unpacked、primary-runtime、Node/Python、所有嵌套许可，不瘦身。额外许可与记录不改动封存 resources。

脚本检查关键文件、Python、无 app-update.yml 和 ZIP 文件数，上游 smoke 检查 runtime inventory、ASAR 和 Office 转换。发布前仍需真实 GUI 启动并确认不请求官方更新服务。unsigned 自有 EXE 可能触发 SmartScreen，不得冒充官方签名或要求关闭安全防护。

## Scoop 发布约定

真实构建与 GUI 验收后，维护者手动发布 `vVERSION` GitHub Release，上传原始 ZIP、SHA256SUMS 和记录，禁止重新压缩 ZIP。Scoop checkver 可匹配 `v([0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+\.[0-9]{8}\.[0-9]+)`，版本与文件名保持一致。hash 使用 SHA256SUMS 中 ZIP 的 SHA256，不是 Actions 外层下载包。每版唯一，不复用已有版本或官方 desktop-v tag。脚本拒绝覆盖本地已有版本目录。

## 许可与复现限制

根依赖安装锁定，但上游 runtime preparation 生成新 runtime lockfile，不保证不同日期构建字节可复现。记录包含实际 Node/pnpm、上游提交、版本、unsigned 和社区补丁。更新 pin 时重新审核补丁、资源布局和许可。

LICENSE 保留上游 MIT 全文，产物再从固定提交复制许可。第三方许可保留原路径，THIRD_PARTY_NOTICES 索引物理可见许可文件，ASAR 内原始许可仍保留，不将该索引宣称为完整法律清单。发布者负责审核再分发条款，名称和图标归各自权利人，MIT 不代表官方背书。
