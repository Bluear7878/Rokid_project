# Rokid Glasses 应用

[English](README.md) | [한국어](README.ko.md) | **简体中文**

适用于带显示屏的 Rokid Glasses（YodaOS-Sprite，Android 12）的 AIUI 应用。

| 应用 | 目录 | 功能 |
|---|---|---|
| Speak English | `outputs/speak-english` | 按下按钮后说韩语，以字幕形式显示英语翻译 |
| Speak French | `outputs/speak-french` | 将韩语语音翻译成法语，可选择显示用韩文标注的近似发音 |

韩语语音识别和翻译尚未在真实眼镜上验证。本地检查使用的是模拟的语音和翻译 API。

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

1. 在 AIUI Studio（https://aiui-global.rokid.com）中把源码更新到对应的 Agent，然后执行 AIX Packaging。
2. 在手机的 Hi Rokid 应用中执行 Settings > Developer Options > AIUI > Update glasses resource。

如果有 Rokid 开发线，可以用 `rokid-dev.ps1 install-launch` 通过 ADB 直接安装，无需经过 Studio。该方式尚未实际测试。

## 注意

各应用目录中的 `AGENTS.md` 定义了 Agent 在眼镜上的行为，会被打包进 AIX 包。它不是给编码 agent 的指令文件。给编码 agent 的指令是仓库根目录下的 `AGENTS.md`。

## 许可证

Apache License 2.0，详见 [LICENSE](LICENSE)。
