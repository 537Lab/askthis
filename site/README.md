# AskThis 产品官网 / Product website

## 中文说明

这是 AskThis v0.1.5 的中英文静态产品官网：默认中文，英文入口在 `en/index.html`。部署地址为 `https://537lab.github.io/askthis/`，仅需把本目录作为 GitHub Pages 部署产物，不需要服务器、API 密钥或安装依赖。

- **修改内容：** 中文 `index.html`、英文 `en/index.html`；两种语言的版本号、下载链接和限制说明要一起更新。
- **修改外观：** `assets/site.css`；交互在 `assets/site.js`。没有 JavaScript 时，正文、下载、常见问题仍可使用。
- **真实画面：** `assets/product-*.webp` 为实际打包版截图的无损编码；回答来自本地演示服务，不是线上模型效果或速度测试。来源见 `asset-provenance.json`。
- **下载维护：** Mac 和 Windows 各自明确区分芯片架构，不用浏览器信息猜 Mac 芯片。新版本发布后，更新两页中的四个安装包直链，并独立验证匿名下载。
- **隐私：** 不加载统计、外部字体或 CDN，不设置追踪 Cookie，不需要后台服务。只部署此目录，不能把开发日志、用户配置或浏览器 profile 放进官网。
- **验收：** `verification.json` 为不含本机路径的自动化验收摘要；截图与测试工具保存在部署目录以外。自动化无障碍扫描不等于完整人工认证，跨平台构建不等于各平台所有功能均已真机验证。

网站文件存在不代表已经上线；是否部署成功要看 Pages 工作流与公开 URL 的实际访问结果。

---

## English


A deployable, bilingual static website for **AskThis v0.1.5**. Chinese is the default; English has its own crawlable page.

## Deploy

Upload the **contents of this directory** as the GitHub Pages artifact. No build step, package install, API key, backend or environment variable is required.

- Chinese entry: `index.html` → `https://537lab.github.io/askthis/`
- English entry: `en/index.html` → `https://537lab.github.io/askthis/en/`
- All runtime stylesheet, script and image references are relative and work under the `/askthis/` project path.
- `.nojekyll` avoids Jekyll processing.
- Do not deploy the repository root or private development files.

This artifact is prepared for deployment; its presence does **not** mean that Pages or a release has been published.

## Maintain

- Main content and metadata: `index.html`, `en/index.html`
- Design and responsive layout: `assets/site.css`
- Progressive enhancement: `assets/site.js` (mobile navigation, keyboard-accessible product tabs, language switching that retains the current section)
- Product images: `assets/product-*.webp`
- Approved B2 brand exports: `assets/brand/`
- Social share images: `assets/og-zh.png`, `assets/og-en.png` (1200 × 630)
- Image origin and processing disclosure: `asset-provenance.json`
- Sanitized acceptance summary: `verification.json`

The product images are lossless encodings of real, current packaged Electron renderer screenshots. No UI was recreated or edited. Content comes from an isolated local demonstration service; timings in the screenshots are **not** online model benchmarks. The clipboard badges are original and correspond to explicit clipboard mode, not the default empty-selection behavior.

For a new release, update all four explicit installer URLs, version labels, architecture guidance and the fallback note in **both** pages. Check public availability separately after publication; the website does not call the GitHub API or infer a Mac chip from a user agent. All platform choices remain visible.

## Privacy and accessibility

No external CDN, remote font, analytics, tracking cookie, web API or storage is used. The site only loads its own static files. A restrictive meta Content Security Policy is included. The site remains readable and downloadable with JavaScript disabled; FAQs use native disclosure elements. Keyboard controls, visible focus styles and reduced-motion preferences are supported.

The type system intentionally uses locally available editorial serif faces for headings and native sans-serif text for reading. It falls back to generic serif / sans-serif without any font download.

## Search engines

Each language has its own title, description, canonical, Open Graph / Twitter image and reciprocal `hreflang` links. `sitemap.xml` lists both canonical pages. The project-path `robots.txt` includes the sitemap location, but crawlers normally consult **origin-root** `/robots.txt`; repository Pages cannot control host-wide robots rules. No misleading host-wide configuration is assumed.

## Verification scope

The browser acceptance summary intentionally contains no local machine paths or runtime logs. Full screenshots, automated test scripts, raw accessibility output and temporary browser profiles are **not** part of this deployment artifact. The verification summary distinguishes local site acceptance from public release / Pages availability. Windows and Linux hardware limitations are stated on both pages.
