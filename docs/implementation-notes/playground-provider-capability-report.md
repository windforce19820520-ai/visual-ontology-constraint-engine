# Playground Provider capability report

核验日期：2026-08-19（仅依据 Provider 官方文档；本报告不代表真实调用已获授权或已完成验收）。

## 结论

Seedream 4.0 是当前满足 Playground 多参考路径的候选：官方接口文档给出最多 10 张输入图、JPEG/PNG、单图最大 15 MB、最大 4096×4096、宽高比 1/3–3；Playground 固定单次输出 1 张并禁用 sequential output。Grok Imagine image quality 的官方 Imagine 说明给出图像编辑最多 3 张参考图，因此不能承载 Virtual Try-On 的 4 张必选图或加 pose 的 5 张图；该 profile 会在 capability preflight 阻断，不会静默删图或降级到其他 Provider。

## Seedream 4.0（`doubao-seedream-4-0-250828`）

| 项目 | 官方核验结果 | Playground 处理 |
| --- | --- | --- |
| 输入 | JPEG/PNG；单图不超过 15 MB；最多 10 张；最大 4096×4096；宽高比 1/3–3 | `maximumReferenceCount=10`、每图 15,000,000 bytes、媒体类型 allow-list；超限 preflight 阻断 |
| 输出 | API 支持 URL 或 `b64_json`，可组图；价格按实际生成张数计 | 固定 `count=1`，不启用 sequential output；真实输出仍需单独批准 |
| 价格/额度 | 火山方舟官方产品页列 Seedream 4.0 为 0.20 元/张，并列出 200 张免费额度；以控制台当前账单为准 | 默认披露单次上限 1 张、每日预算 2 元；不会自动重试或切 Provider |
| 鉴权 | Ark API 使用 API Key；官方文档建议放在环境变量 | 只允许 `user_ephemeral`；请求级注入，不能进入合同、hash、trace、日志或响应 |
| 引用传输 | Image Generation API 接受 URL 或 Base64 data URI | 代码只保留官方 endpoint/profile 桥接点；当前 transport 关闭，不发送上传图片 |
| 隐私/数据 | 火山引擎官方客户数据协议将输入与生成的文本、图形、图片等定义为客户数据，要求来源合法并取得必要授权；官方信任页声明数据归用户、提供加密和生命周期管理 | UI 强制权利确认；在没有额外 retention/ZDR 书面确认前，不宣称零留存或不训练；线上启用前需再次审查条款 |
| 限流/失败 | 官方生成 API 页面给出输入/输出与错误约束；当前 profile 记录 500 images/min 作为文档核验值，实际账户配额优先 | 速率/日预算/并发门在 Host 侧先检查；一次调用、零自动重试 |

官方链接：

- [Seedream 4.0 API 输入限制](https://www.volcengine.com/docs/85621/1863351)
- [火山方舟图片生成 API](https://api.volcengine.com/api-explorer/?action=ImageGenerations&groupName=%E5%9B%BE%E7%89%87%E7%94%9F%E6%88%90API&serviceCode=ark&version=2024-01-01)
- [火山方舟官方价格页](https://www.volcengine.com/product/ark)
- [火山引擎客户数据协议](https://www.volcengine.com/docs/82379/1359327?lang=zh)
- [火山引擎隐私与数据安全](https://www.volcengine.com/trust/privacy)

## Grok Imagine image quality

| 项目 | 官方核验结果 | Playground 处理 |
| --- | --- | --- |
| 输入 | Imagine overview 的 image editing 支持最多 3 张参考图；官方模型页列图像输入最大 20 MiB、JPEG/PNG | `maximumReferenceCount=3`、每图 20 MiB、JPEG/PNG；4/5 图路径明确阻断 |
| 输出/价格 | 官方模型页：输入图 0.002 USD/张，1K/2K 输出 0.02 USD/张；quality profile 官方 pricing 页为 1K 0.05 USD、2K 0.07 USD | 当前 profile 选 `grok-imagine-image-quality`，按 0.05 USD/张估算，固定单图；实际 resolution 选择仍需产品批准 |
| 鉴权 | `Authorization: Bearer $XAI_API_KEY`；官方 quickstart 要求 API key | 只允许 `user_ephemeral`，不得写入磁盘、Cookie、localStorage、sessionStorage、analytics 或日志；不发起额外验证请求 |
| 引用传输 | 官方编辑 API 支持 public URL 或 Base64；Files API 可用私有 `file_id` | Host 不要求公开输入 URL；当前真实 transport 关闭 |
| 隐私/留存 | xAI 官方 Security FAQ：默认 API 请求和响应加密留存 30 天用于滥用审计；不以这些数据训练；团队级 ZDR 可关闭内容留存但会禁用依赖存储的功能 | 不宣称默认零留存；如果未来启用，部署前必须确认团队 ZDR/条款及文件能力 |
| 限流/失败 | 官方模型页给出 5 requests/second；生成失败、内容策略和服务错误语义仍由 API 返回 | Host 侧 5 rps/单调用/无自动重试；失败只返回安全错误映射 |

官方链接：

- [Imagine overview（最多 3 张编辑参考）](https://docs.x.ai/developers/model-capabilities/imagine)
- [Grok Imagine image model](https://docs.x.ai/developers/models/grok-imagine-image)
- [xAI Imagine pricing](https://docs.x.ai/developers/pricing)
- [Imagine 私有 Files 输入](https://docs.x.ai/developers/model-capabilities/imagine/files/inputs)
- [xAI API Security / retention / ZDR](https://docs.x.ai/developers/faq/security)

## 代码边界

本阶段只实现 allow-listed capability profiles、机械 materializer bridge、BYOK 请求级边界、mock transport 和 preflight。Seedream 与 Grok 的真实网络 transport 默认关闭；没有注入真实 secret、没有真实或付费 Provider 调用、没有公网部署。任何真实调用、secret 注入、公开部署或超过披露预算的动作都需要用户再次明确批准。
