# Alyx's Studio

- 网站：https://alyxsstudio.com
- 后台：https://alyxsstudio.com/admin
- 托管：GitHub Pages。每次在后台点保存，GitHub 会自动发布，大约 1 分钟后生效。

## 栏目

| 栏目 | 放什么 | 在后台哪里改 |
|---|---|---|
| Daily | 碎碎念、感悟、图片、语音、转载、截图。网站上有日历，有更新的那天显示缩略图 | Daily 日常 |
| Ongoing | 每天在长的合集：连载小说、图片词典、图片连载……会按设定自动排序，可以打包下载 | 先在「Ongoing 合集设置」建合集，再在「Ongoing 每日更新」里往合集加条目 |
| Books | 出版在 Amazon / Apple Books 的书，分 Writing / Language / Art | Books · Store · Traces → Books |
| Visual | 壁纸、头像、封面系列，可以设置成访客能下载 | Visual 图片系列 |
| Design | 草图、构思图 | Design 草图·构思 |
| Store | 衣服、帽子、包、挂件……附购买链接 | Books · Store · Traces → Store |
| Traces | 作品去过的地方：发表、展出、对谈、合作、协会、报道 | Books · Store · Traces → Traces |
| Follow | 所有平台的链接，同时显示在每页底部 | Site 网站设置 → Follow |

- **改栏目名字或菜单顺序**：只在「Site 网站设置 → 栏目名称和菜单」里改。菜单、首页和页面标题会一起变。
- **首页显示什么、按什么顺序**：在「Site 网站设置 → 首页 · 联系方式 → 首页模块」里调整。
- **字体、颜色、字号、每行几张图**：在「Site 网站设置 → Look」里改。

## 打包下载
- **合集**（Ongoing）可以导出 PDF、EPUB 或 ZIP：
  - EPUB 可以直接用 Kindle 的 "Send to Kindle" 发送，也可以上传到 Apple Books。
  - ZIP 里是原图和每一条的文字。
- 每个合集和每个 Visual 系列都可以单独设置下载权限：**只有我**，或者**所有访客**。
- **"只有我"是怎么判断的**：在自己的电脑或手机上打开一次 `alyxsstudio.com/?me`，那台设备就进入"我"的模式，能看到所有下载按钮。页面底部还有 **Download everything**，可以把整个网站（文字、图片、音频）打包成一个 ZIP 备份。
  - 退出这个模式：打开 `alyxsstudio.com/?me=0`。
  - 注意：这只是把按钮藏起来，不是加密。网站上的内容本身是公开的。

## 小提示
- 上传的图片会自动转成 webp，并缩小到长边 2880px 以内，网站不会越来越慢。
- 语音和音频建议每个 30MB 以内。
- 想先写好、暂时不公开，就勾选"先不公开"。
- 旧的网址（/shop、/art、/serial……）会自动跳转到新栏目。

## 技术说明
- `content/`：Daily、Ongoing、Visual、Design 的内容，一条一个文件。
- `data/`：其余设置和列表。
- `scripts/build.mjs`：发布时把 `content/` 整理成网站用的数据。
- `.github/workflows/pages.yml`：自动发布到 GitHub Pages。
