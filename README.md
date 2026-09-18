# EasyMint Mobile

EasyMint 的 iOS/Android 局域网终端。手机通过二维码与桌面端配对，随后用加密 WebSocket 实时操作电脑当前打开的项目和会话。

## 开发

```bash
npm install
npx expo run:ios
# 或
npx expo run:android
```

首次原生构建后，可用 `npm start` 启动 Metro。项目使用 Expo SDK 57 Development Build；相机、SecureStore 和局域网权限由 `app.json` 配置。

桌面端启动 EasyMint 后，在「设备互联 → 手机终端」中生成二维码。手机扫码并核对六位数字，再在电脑上确认配对。

## 数据边界

手机只在系统 SecureStore/Keychain 中保存 PC 标识、局域网地址、设备标识和配对共享密钥。项目、会话、消息、模型配置与实时输出只保存在运行内存中，App 不把这些业务数据写入文件、数据库或异步缓存。

通信使用 P-256 ECDH、HKDF-SHA256 和 AES-256-GCM。PC 只允许访问 EasyMint 窗口中当前打开的项目，并且不会向手机发送项目绝对路径或 API 密钥。
