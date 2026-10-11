# Rokid Glasses 应用

[English](README.md) | [한국어](README.ko.md) | **简体中文**

适用于带显示屏的 Rokid Glasses（YodaOS-Sprite，Android 12）的 AIUI 应用。

| 应用 | 目录 | 功能 |
|---|---|---|
| My Translate 0.3.0 | `outputs/speak-english` | 将韩语翻译成英语、简体中文或法语；法语可附韩文近似读音 |
| Speak French 0.1.2（兼容版） | `outputs/speak-french` | 保留独立法语应用，并修复按一次返回即可请求退出 |

My Translate 更新原有的 Speak English Agent，源码目录和默认命令不变。输入固定为韩语（`ko-KR`），菜单均为韩语，使用按钮和滑动操作，不进行语言检测或语音菜单控制。在任意界面按一次返回即可请求关闭应用。闲置 60 秒后仅清空显示，应用仍保持打开。重新打开应用可选择另一目标语言。

韩语识别、翻译、延迟及实际返回退出行为尚未在真实眼镜上验证。本地检查使用的是模拟的语音和翻译 API。

使用 "Hi Rokid, open my translate" 启动。录音期间预先创建新的翻译会话，并在完整响应结束前逐步显示译文。法语的韩文读音在最终校验后显示。不支持流式输出的环境会一次显示完整结果。实际启动路由和延迟改善仍需在眼镜上验证。

## 目录结构

- `outputs/speak-english`、`outputs/speak-french`：应用源码。各目录下有单独的 `README.txt`（韩语）。
- `outputs/scripts/rokid-dev.ps1`：执行检查、预览、打包和设备安装的脚本
- `outputs/development-setup.txt`：开发环境安装与使用的完整说明（韩语）
- `work/`：开发工具（Node.js、AIX CLI、JDK、Android SDK）和临时文件，不纳入仓库。

在新电脑上，需要按照 `outputs/development-setup.txt` 第 3 章列出的版本，把工具重新安装到 `work/`。脚本会在该目录下查找这些工具。

## 常用命令

Windows PowerShell：

```powershell
$s = 'outputs\scripts\rokid-dev.ps1'
powershell -NoProfile -ExecutionPolicy Bypass -File $s check                        # 检查源码（speak-english）
powershell -NoProfile -ExecutionPolicy Bypass -File $s check -Project speak-french  # 另一个应用
powershell -NoProfile -ExecutionPolicy Bypass -File $s preview -Open                # 界面预览
powershell -NoProfile -ExecutionPolicy Bypass -File $s pack                         # 生成 AIX 包
```

## 版本

- 应用版本是各应用 `app.json` 和 `package.json` 中的 `version` 字段，两处需要同时更新。
- 已上传到 AIUI Studio 或已安装到眼镜的版本，会打上 `<应用目录名>-v<版本号>` 形式的标签，例如 `speak-english-v0.1.1`。

## 部署到眼镜

修改本仓库不会自动同步到眼镜。

1. 在 AIUI Studio（https://aiui-global.rokid.com）中把源码更新到对应的 Agent，然后执行 AIX Packaging 和 Save Details。将原有 Speak English 重命名为 My Translate，无需新建 Agent。
2. 在手机的 Hi Rokid 应用中执行 Settings > Developer Options > AIUI > Update glasses resource。

如果有 Rokid 开发线，可以用 `rokid-dev.ps1 install-launch` 通过 ADB 直接安装，无需经过 Studio。该方式尚未实际测试。

## 注意

各应用目录中的 `AGENTS.md` 定义了 Agent 在眼镜上的行为，会被打包进 AIX 包。它不是给编码 agent 的指令文件。给编码 agent 的指令是仓库根目录下的 `AGENTS.md`。

## 隐私保护钩子

本仓库是公开的，因此 git 钩子会拒绝包含个人、设备或账号信息的提交和推送：姓名和邮箱地址、设备序列号、各类 ID 和令牌、本地用户路径、IP 和 MAC 地址、图片、录音和日志。每次克隆后启用一次：

```
git config core.hooksPath .githooks
```

钩子还需要一份记录你本人标识信息的私有列表。该列表只保存在 `.git` 目录内，不会被推送。列表、规则以及如何登记例外，见 `.githooks/privacy-scan.sh`。

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。
