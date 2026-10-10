# Alyx's Studio

网站地址：https://alyxsstudio.com
编辑后台：https://alyxsstudio.com/admin

日常更新只需要打开后台：改文字、上传图片和 mp3、调字体和颜色，点保存后约 1 分钟网站自动更新。

---

## 第一次设置（只做一次）

### 1. 注册 GitHub，建一个仓库
1. 打开 https://github.com/signup 注册账号，记住你的用户名。
2. 登录后点右上角 **+** → **New repository**。
3. Repository name 填 `alyxsstudio`。Public 或 Private 都可以，其他选项不用动。点 **Create repository**。

### 2. 把网站文件传到仓库
1. 在新仓库页面，点 **uploading an existing file** 这个链接。
2. 打开解压后的 `alyxs-studio` 文件夹，全选**里面的所有东西**（admin、assets、data、index.html……），一起拖进网页。注意是拖文件夹里面的内容，不是拖外层的 `alyxs-studio` 文件夹本身。
3. 等文件都列出来后，点页面下方的 **Commit changes**。

### 3. 填写你的 GitHub 用户名
1. 在仓库里依次点 `admin` → `config.yml`，再点右上角的铅笔图标 ✏️。
2. 找到 `repo: GITHUB-USERNAME/alyxsstudio` 这一行，把 `GITHUB-USERNAME` 改成你的用户名。
3. 点 **Commit changes** 保存。

### 4. 让 Netlify 跟着 GitHub 自动更新
1. 打开 Netlify，进入 alyxsstudio 网站。
2. 依次进入 **Project configuration** → **Build & deploy** → **Continuous deployment**，点 **Link repository**（或 Link to Git）。
3. 选 **GitHub**，授权后选择 `alyxsstudio` 仓库。
4. Branch 选 `main`。Build command 留空，Publish directory 填 `.`。点 **Deploy**。

域名和 HTTPS 都不会变。

### 5. 第一次登录后台
1. 打开 https://alyxsstudio.com/admin，点 **Sign In Using Access Token**。
2. 弹出的窗口里有一个链接，点它会打开 GitHub 的 token 页面，需要的权限已经帮你选好了。
3. Repository access 选 **Only select repositories**，再选 `alyxsstudio`。
4. 生成 token，复制，粘贴回后台。浏览器会记住它，以后打开后台就直接进去了。

> 不要把 token 发给任何人，它相当于这个仓库的钥匙。

---

## 后台里有什么

**Studio 网站设置**
- **Design**：字体、颜色、字号、logo 大小、图片圆角、每行显示几个、图片比例。
- **名称 · 联系 · 首页**：网站名、首页那句话、邮箱、Instagram、首页的方格图片、替换 logo。

**Sections 栏目内容**

每个栏目都可以改栏目名和简介，条目可以新增、删除、调整顺序。各栏目能做的事：

| 栏目 | 可以做的事 |
|---|---|
| Writing | 正文直接写在后台，就能在网站上阅读；也可以只填外部链接 |
| Research | 标题、期刊、链接，可以上传 PDF |
| CV | 自己建分组（如 Education、Publications），可以上传简历 PDF |
| Books | 封面，加 Kindle / Apple Books / Amazon 按钮 |
| Serial | 每一章的正文写在后台，读者在网站上翻章阅读 |
| Podcast | 上传 mp3 后网站上可以直接播放；也可以填 Spotify 等链接 |
| Vlog | 填 YouTube 链接，封面会自动显示 |
| Objects / Art / Wardrobe | 图片、名字、一句说明 |
| Picks | 亚马逊推荐 |
| Shop | 价格、状态（可购买 / 即将上架 / 售罄）、付款链接 |

## 一些建议
- **图片**：jpg 格式，宽 1200–1600px，每张 300KB 左右最合适。
- **mp3**：每个 30MB 以内。节目多了以后，建议把音频放到 Spotify for Creators 等平台，网站上填收听链接。
- **商店付款**：网站本身不能收款。`付款链接` 填 Stripe Payment Link、Gumroad 或 Shopify 的链接。
- **保存后没变化**：等一两分钟再刷新。也可以在 Netlify 的 **Deploys** 页面查看进度。
