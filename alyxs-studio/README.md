# Alyx's Studio

- 网站：https://alyxsstudio.com
- 后台：https://alyxsstudio.com/admin
- 托管：GitHub Pages。每次在后台点保存，GitHub 会自动发布，大约 1 分钟后生效。

## 栏目

| 栏目 | 放什么 | 在后台哪里改 |
|---|---|---|
| Daily | 碎碎念、感悟、图片、语音、转载、截图。网站上有日历，有更新的那天显示缩略图 | Daily 日常 |
| Ongoing | 每天在长的合集：连载小说、图片词典、图片连载……会按设定自动排序，可以打包下载 | 先在「Ongoing 合集设置」建合集，再在「Ongoing 每日更新」里往合集加条目 |
| Watch | 视频：贴 YouTube、TikTok、Instagram、B站、抖音、Vimeo 的链接，网站上直接显示视频；也可以上传短视频文件 | 网页上点 **+**，或后台「Watch · Listen 视频和音乐」 |
| Listen | 音乐和播客：贴 Spotify、Apple Music、Apple Podcasts、SoundCloud、Bandcamp、网易云的链接，显示播放器；自己的歌可以直接上传，有 Play all | 同上 |
| Books | 出版在 Amazon / Apple Books 的书，分 Writing / Language / Art | Books · Store · Traces → Books |
| Visual | 壁纸、头像、封面系列，可以设置成访客能下载 | Visual 图片系列 |
| Design | 草图、构思图 | Design 草图·构思 |
| Store | 衣服、帽子、包、挂件……附购买链接 | Books · Store · Traces → Store |
| Traces | 作品去过的地方：发表、展出、对谈、合作、协会、报道 | Books · Store · Traces → Traces |
| Follow | 所有平台的链接，同时显示在每页底部 | Site 网站设置 → Follow |

- **改栏目名字或菜单顺序**：只在「Site 网站设置 → 栏目名称和菜单」里改。菜单、首页和页面标题会一起变。
- **首页显示什么、按什么顺序**：在「Site 网站设置 → 首页 · 联系方式 → 首页模块」里调整。
- **字体、颜色、字号、每行几张图**：在「Site 网站设置 → Look」里改。

## 在网页上直接编辑（不用进后台）
1. 在你的设备上打开一次 `alyxsstudio.com/?me`，进入"我"的模式。
2. 第一次使用前，在同一个浏览器里打开 `/admin` 登录一次。网页编辑用的是同一个登录。

之后在网站上可以直接操作：
- **Daily** 和首页：右下角的 **+** 是发新日常。可以写文字、加图片（拖进来、粘贴截图都行）、录语音、加转载链接。每条日常旁边有 **Edit**，可以修改或删除。
- **Ongoing**：进入一个合集，点 **+ New entry** 加一条。
  - 文字类合集（比如小说）会打开整屏的写作页面：自动保存在这台设备上，按 **Publish**（或 ⌘S）发布到网站。
- **Visual**：点 **+ Add pictures**，往系列里加图。
- **Design**：右下角 **+** 新建草图。

保存后，网站大约 1 分钟后更新。

## Watch 和 Listen：贴链接就显示
- 在 Watch 或 Listen 页面点右下角 **+**：
  - **Paste a link**：粘贴作品页面的链接，下面马上出现预览。标题可以不填。
  - **Upload a file**：上传自己的歌、录音或短视频（95MB 以内），可以加封面。
- 发布时网站会自动去平台抓标题和封面，封面会存一份在网站里，平台以后删图也不影响。
- 视频滑到屏幕中间会自动静音播放，点一下就是有声音的正常播放。不想自动播放：后台「首页 · 联系方式」里关掉"视频滑到屏幕中间时自动静音播放"。
- 视频自动放 Watch，音乐和播客自动放 Listen；想换位置，在编辑里改"Show it in"。
- 自己上传的歌会排成歌单，点 **Play all** 连着播，底部有播放条。
- Daily 的"转载 / 链接"里贴视频或音乐链接，也会直接显示成播放器。
- 小红书、微博、X 这些不让别的网站嵌入播放，会显示成带封面的卡片，点了去原页面看。
- 抓取情况记在 `data/embeds.json`，想改某个标题可以直接改这里。

## 中文写，英文显示
- 写的时候用中文就行，后台保存的也是中文原文。
- 每次发布时会自动生成英文版。用哪个翻译，取决于你在 GitHub 存了哪把钥匙（仓库 Settings → Secrets and variables → Actions → New repository secret）：
  - 什么都不存：用免费的 MyMemory，不用设置，但英文比较直白，每天大约 5000 字，超出的第二天继续翻。
  - `GEMINI_API_KEY`：Google Gemini，在 aistudio.google.com 免费申请，英文自然很多。
  - `ANTHROPIC_API_KEY`：Claude，英文最有文学感，按量付费，每月几美分到几美元。
  - `DEEPL_API_KEY`：DeepL 免费版。
  - 存了钥匙以后，之前用免费翻译翻过、你没手动改过的段落，会在下次发布时自动用新的重翻一遍。
- 访客默认看到英文。
- 页面底部有 **English / 中文** 切换（只在"我"的模式下显示，想让访客也能切换，可以在 settings 里加 `language_switch: true`）。
- 每条日常旁边有 **原文** 按钮，可以看中文原文。
- 小说章节可以切换 **English / 中文 / 对照**，对照模式下中英文逐段并排。
- 想改某段英文：直接修改 `data/translations.json` 里对应的 "en"，以后会一直保留你改的版本。
- 一次发布太多新内容时，剩下的会在下一次发布时继续翻译，在翻译完成之前暂时显示中文。
- 翻译情况可以看 `alyxsstudio.com/data/translate-status.json`（用的哪个翻译、还剩几段、有没有出错）。

## 引用卡片
在任何文章或章节里选中一段文字，会出现 **Quote card** 按钮，点一下生成一张 Story 尺寸的引用图。手机上会直接调出分享面板。

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
