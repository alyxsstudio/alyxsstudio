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
1. 在你的设备上打开一次 `alyxsstudio.com/?me`，进入"我"的模式（Owner）。
2. 第一次保存前，在同一个浏览器里打开 `/admin` 登录一次。网页编辑用的是同一个登录。

进入后，网站上能看到的几乎所有东西都可以直接改：
- **带虚线下划线的字**：点一下直接改，比如栏目名（Ongoing、Traces……）、页面介绍、首页小标题、系列名、合集名、底部邮箱。改完按回车或点别处。
  - 这类改动会先存在你的设备上，左下角出现 **"N changes · Publish"**，点 **Publish** 才发布到网站；点 **Undo** 撤销。
- **首页**：每个模块上方有 ↑ ↓ 移动、**Edit** 设置、× 删除；模块之间有 **+ Add a block here**，可以加文字、大图、日常、视频等模块。
- **各栏目**：
  - Store、Books、Traces、Follow：每项下面有 **Edit** 和 ← → 移动，顶部有 **+ New**。
  - 分类：Store、Books 的分类旁边有 ✎，可以改名；新分类在添加或编辑物品时直接输入。
  - Visual：每张图有 Edit 和 ← →，系列有 Series settings。
  - Ongoing：合集有 Collection settings。
  - Daily：日历上点空白的一天就是在那天发新日常；点已有日常的文字就能修改。
- **左下角 ✎ Owner**：
  - **Menu & page names**：改菜单顺序和栏目名。
  - **Name, logo, email**：网站名、logo、邮箱、顶部通知。
  - **Fonts, colours, sizes**：字体、颜色、字号、中文字体和中文大小，改的时候页面马上变。
  - 切换"你看到的语言"，下载全站备份，退出 Owner 模式。
- **草稿自动保存**：所有表单（日常、章节、物品、设置……）边写边自动存在这台设备上，关掉或刷新再打开会接着写，保存成功后草稿自动清掉。

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
- 你用中文写，后台保存中文原文；网站更新时自动生成英文。
- **访客只看到英文**（除非在 Name, logo, email 里打开 "Let visitors switch to Chinese"）。
- **Owner 模式下你默认看到中文**，章节可以切换 中文 / English / 对照，日常有 English 按钮看翻译。
- 想看访客看到的样子：左下角 ✎ Owner → English · what visitors see。在英文视图里点字修改，改的是英文版本，以后一直保留你改的。
- 翻译用哪个服务、怎么换：
  - 什么都不设置：用免费的 MyMemory，英文比较直白，每天大约 5000 字，超出的第二天继续翻。
  - 想要更好的英文，在仓库 Settings → Secrets and variables → Actions 里存一把钥匙：`GEMINI_API_KEY`（免费）、`DEEPL_API_KEY`（DeepL 免费版）或 `ANTHROPIC_API_KEY`（Claude，按量付费）。
  - 存了钥匙后，免费翻译翻过、你没手动改过的段落会自动重翻。
- 一次发布太多新内容时，剩下的下次发布继续翻，翻好之前暂时显示中文。翻译情况见 `alyxsstudio.com/data/translate-status.json`。
- 中文字体和大小在 Fonts, colours, sizes 里调（"Chinese size next to English"），让中文和英文看起来一样大。

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
