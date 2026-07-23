<p align="center"><img src="assets/logo.svg" width="72" height="72" alt="8码快传"></p>

<h1 align="center">8码快传推广站</h1>

<p align="center">文件，不必先上传。<br>Files do not need an upload first.</p>

<p align="center"><img src="assets/promo/social-horizontal-zh.png" width="900" alt="8码快传：大文件，直接发过去"></p>

<p align="center">
  <a href="https://t.8ma.co/about/"><strong>访问推广站</strong></a>
  ·
  <a href="https://t.8ma.co"><strong>立即传文件</strong></a>
</p>

## 本仓库内容

这是 8码快传的公开推广资料与静态网站，只包含：

- 中文、英文、西班牙语、阿拉伯语、印地语、法语、日语和韩语产品介绍
- 大文件、断点续传、电脑互传、手机电脑、同 WiFi、免网盘、免登录和聊天软件外传文件指南
- SEO、GEO 和社交分享元数据
- 产品 Logo 与公开宣传图
- 媒体资料页、真实产品截图与平台发布文案
- 静态站点页面与公开字体资源

产品介绍、长尾指南、媒体页和法律页使用统一页面模板生成。新增语言只需登记语言配置并重新运行 `scripts/generate-multilingual-site.mjs`，不需要维护另一套页面代码。

本仓库不包含产品源代码、部署配置、服务器信息、凭据、内部文档或用户数据。

## 本地预览

```bash
python3 -m http.server 8080
```

然后打开 <http://localhost:8080>。

## 产品特点

8码快传免费使用，无需安装或注册登录。同一 WiFi 下，电脑和手机同时打开网站，开启附近分享即可互传文件；也可以使用链接、二维码或 8 位提取码。传输会充分利用当前网络的可用带宽，文件不会被保存成可长期下载的副本。桌面版 Chrome 和 Edge 单文件最高支持 100 GB。

产品入口：[t.8ma.co](https://t.8ma.co)

媒体资料：[t.8ma.co/about/press/](https://t.8ma.co/about/press/)

## 推广素材

`assets/promo/` 提供中英文横图、中文竖图、16 秒 MP4 和 GIF；`assets/screenshots/` 提供真实产品界面截图。`media/copy/` 包含知乎、小红书、V2EX、Bilibili、Product Hunt、Reddit 和 X 的定制发布文案，每个平台使用独立来源链接。

## 站点巡检

公开工作流每天检查线上页面、站点地图、canonical、语言对应关系、主要图片和公开内容边界。也可以在仓库根目录执行：

```bash
python3 scripts/check-site.py
```
