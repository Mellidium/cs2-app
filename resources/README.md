# Resources

Binary assets referenced by `electron-builder.yml`, the main process, and the tray.
These are **placeholders** — drop real assets in with these exact names before packaging:

| File           | Purpose                              | Notes                          |
| -------------- | ------------------------------------ | ------------------------------ |
| `icon.ico`     | Windows app + installer icon         | 256×256 multi-res `.ico`       |
| `icon.png`     | macOS/dev app icon                   | 512×512 or 1024×1024 PNG       |
| `tray-icon.png`| System tray icon                     | 16×16 or 32×32 PNG, transparent |

Until real icons are added the tray falls back to an empty image and packaging
will warn about the missing `icon.ico`. Neither blocks `npm run dev`.
