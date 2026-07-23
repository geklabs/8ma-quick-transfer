<p align="center"><img src="assets/logo.svg" width="72" height="72" alt="8码快传"></p>

<h1 align="center">8码快传推广站</h1>

<p align="center">文件，不必先上传。<br>Files do not need an upload first.</p>

<p align="center">
  <a href="https://geklabs.github.io/8ma-quick-transfer/"><strong>访问推广站</strong></a>
  ·
  <a href="https://t.8ma.co"><strong>立即传文件</strong></a>
</p>

## 本仓库内容

这是 8码快传的公开推广资料与静态网站，只包含：

- 中英文产品介绍
- SEO、GEO 和社交分享元数据
- 产品 Logo 与公开宣传图
- GitHub Pages 发布工作流

本仓库不包含产品源代码、部署配置、服务器信息、凭据、内部文档或用户数据。

## 本地预览

```bash
python3 -m http.server 8080
```

然后打开 <http://localhost:8080>。

## 产品边界

8码快传通过 WebRTC DataChannel 传输文件，服务端负责信令和临时房间，不持久化文件内容。复杂网络下可能通过 TURN 服务中继加密流量。

产品入口：[t.8ma.co](https://t.8ma.co)
