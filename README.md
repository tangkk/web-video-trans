# web-video-trans

一个纯前端、本地处理的小工具原型：

- 选择本地视频/音频文件
- 直接在浏览器里播放
- 用 `ffmpeg.wasm` 在浏览器本地抽取真实音轨
- 把真实音轨解码后生成波形进度条
- 点击波形或拖动滑条进行跳转
- 无后端、无文件上传

## 启动

```bash
cd ~/Documents/Projects/web-video-trans
npm install
npm run dev
```

打开终端输出里的本地地址，通常是：

```text
http://localhost:5173
```

## 构建

```bash
npm run build
```

构建产物在：

```text
dist/
```

## 技术路线

- `Vite`：静态前端开发/构建
- `@ffmpeg/ffmpeg`：在浏览器里运行 ffmpeg
- `@ffmpeg/util`：文件与 blob URL 工具
- `AudioContext.decodeAudioData()`：解码 ffmpeg 输出的 WAV
- `Canvas`：绘制可点击的波形进度条

## 当前行为

1. 选择本地视频
2. 浏览器加载 `ffmpeg.wasm` 内核（首次较慢）
3. 在浏览器本地把视频音轨抽成单声道 16k WAV
4. 解码 WAV
5. 计算 peaks
6. 绘制真实波形

## 注意事项

- 首次使用会下载 ffmpeg core，体积较大
- 大视频会比较吃 CPU / 内存
- 全程本地处理，不会上传视频文件
- 如果切换文件，旧任务会自动作废

## 后续建议

如果下一步要继续做，我建议按这个顺序：

1. 加一个更明确的进度条（ffmpeg 抽取进度）
2. 做 Web Worker，避免主线程卡顿
3. 支持导出音频 / 字幕 / 切片
4. 进一步优化移动端体验
