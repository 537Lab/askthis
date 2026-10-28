# AskThis approved identity / 已确认的品牌资源

B2「舒展 / Open counter」是用户已确认的最终图标。这些 SVG、ICNS 与光栅文件逐字节来自 `docs/dialogue-a-refinement/b2-open/` 的已验收版本，不再重画、改色或改变曲线。

Run / 生成实际使用资源：

```sh
python3 scripts/generate-icons.py
```

The standard-library-only script copies the approved exports to app/tray locations and extracts the SVG geometry into `src/renderer/src/shared/brand-mark.ts`. It does not redraw or rasterize the design. / 此脚本只复制已确认导出，并从 SVG 提取 React 需要的原始路径，不进行重绘或重新光栅化。

- `app.svg` + `app.icns` + `app-1024.png`: application identity / 应用图标。
- `mark.svg`: normal-size monochrome identity / 常规尺寸单色标志。
- `small-mark.svg` + `mark-16.png` + `mark-32.png`: existing optical master for headers, settings footer and macOS template tray / 已确认的小尺寸光学校正版，用于标题栏、设置页脚与 macOS 托盘。
- `app-32.png`: Windows/Linux colored tray / Windows 与 Linux 彩色托盘。

The source fingerprints are pinned in `tests/unit/brand.test.cjs`. A future intentional brand redesign must be reviewed explicitly, not silently regenerated. / 原始资源摘要固定在单测中；未来若要改设计，应重新明确确认，不应偷偷重新生成。
