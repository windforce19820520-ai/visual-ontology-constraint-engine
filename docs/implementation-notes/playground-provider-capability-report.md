# Playground Provider capability report

文档核验日期：2026-08-19。Seedream 5.0 Pro 部分同时引用 2026-08-14 至 2026-08-18 的 RC.3/RC.4 真实 Provider 验收；当前账户可用性与账单仍以火山方舟控制台为准。

## 2026-08-21 本机产品验收

仓库所有者已在本机 Playground 完成当前 Virtual Try-On 与 Cosplay 主路径的手工验收，并确认本次测试结果可接受。验收覆盖英文页面、互斥的 Full outfit 与 Top/Bottom 路径、可选 typed accessory、Cosplay 30 种构图选择、Inspect Plan、真实生成开关以及免费 Cloudflare 限制说明；同时使用 Cloudflare Free 与 Seedream BYOK 实际生成了多个换衣、Cosplay 和构图场景。该确认是 RC.5 源码状态的本地产品验收，不是公开部署验收，也不把若干随机输出提升为普遍模型质量保证。真实凭据、人物输入和生成图片均未提交。

测试使用的个人图片、角色图、服装图、配饰图、API token 和生成结果均未加入仓库。标准测试和 GitHub Actions 仍不执行真实 Provider 调用；真实调用继续要求页面逐次确认，并受 Provider、引用数量、尺寸、预算、速率和无自动重试门禁约束。

## 2026-08-21 紧凑提示词回归

当前通用 materializer 的硬上限为 4,000 字符。离线 transport-boundary 回归现已同时覆盖 Cloudflare 的 Virtual Try-On 和全部 30 种 Cosplay 构图，并继续覆盖 Seedream。一个不要求服装分类的 Top-only Try-On 提示词为 974 字符；Cloudflare 的 30 种 Cosplay 提示词范围为 1,726 字符（`dutch-angle`）至 2,964 字符（`mirror-composition`）。引用顺序、角色隔离、构图语义、multipart 字段、四图上限及严格小于 512 像素的门禁均保持通过。这里是无网络的确定性回归，不代表真实输出质量已经验收；真实 Provider 图片验收必须单独记录。

同日随后执行了两次、且仅两次真实 Cloudflare 调用，没有自动或人工重试。三引用 Virtual Try-On（人物、full outfit、手链）成功返回：服装发生实质替换，人物原包被移除，证明紧凑提示词下编辑链路可用；但配饰只做到近似还原，方形输出也没有完整保留脚部构图。两引用 Cosplay 加 `full-shot` 同样成功返回：角色发型、服装和全身构图基本生效，但人物人脸身份没有可靠保留。结论是 Cloudflare 已通过“请求与编辑功能可用”验收，但没有通过 Seedream/Grok 等级的身份、配饰和复杂构图质量验收；产品文案必须继续明确其免费额度、尺寸限制和较低保真度，不得宣称质量等价或生产级人物一致性。

## 结论

普通产品 selector 现按 Seedream 推荐高质量 BYOK、Grok 可选高质量 BYOK、Cloudflare 免费实验预览排序。Cloudflare 不再作为默认质量代表：官方模型说明支持最多 4 张有序二进制参考图，字段固定为 `input_image_0`…`input_image_3`，每张图的宽高必须严格小于 512；模型为固定 4 步蒸馏 4B，输出宽高范围为 256–1920。Workers AI 免费额度为共享的 10,000 Neurons/日，00:00 UTC 重置；Playground 在 Host 侧以不超过该上限的 quota gate fail-closed，绝不自动重试、付费续用或切换 Provider。Cloudflare 使用 operator-managed 服务端凭据，不在浏览器展示或接收 Cloudflare Key。Cloudflare 数据使用文档说明 Customer Content 不用于训练或改进 Cloudflare/第三方服务，除非取得明确同意；若部署另行使用 R2/KV/DO 等存储服务，留存边界需重新审查。

Seedream 5.0 Pro 是当前 Playground 的多参考 BYOK 选择，固定使用 RC.3/RC.4 已真实验收成功的 `doubao-seedream-5-0-pro-260628`。验收时相同国内 Ark endpoint 完成 3/3 HTTP 200，使用 `n=1`、JPEG、2K、无水印的单图请求；Playground 不发送 4.0 专用的 sequential/stream/response-format 字段。Grok Imagine image quality 的官方 Imagine 说明给出图像编辑最多 3 张参考图，因此不能承载超过 3 张引用的计划；该 profile 会在 capability preflight 阻断，不会静默删图或降级到其他 Provider。

Cloudflare 的 4-reference 上限意味着 Try-On 的可选第五张 pose 参考仍能离线 Compile，但不能在该 profile Generate；Host 在 transport 前阻断，不删除、重排或替换角色。Cosplay 的 prop-plus-pose 四图路径在上限内。Cloudflare 的 operator-managed 账号与 token 只在部署 Host 进程里注入；仓库提供 allow-listed HTTP transport，但不包含任何真实凭据，也不在标准测试中进行真实网络调用。生成图只在 Host 请求级内存中短暂保留并通过不缓存的同源地址展示。

## Cloudflare Workers AI FLUX.2 klein 4B（免费实验预览 profile）

| 项目 | 官方核验结果 | Playground 处理 |
| --- | --- | --- |
| Provider / model | Cloudflare Workers AI / `@cf/black-forest-labs/flux-2-klein-4b` | allow-listed profile `cloudflare-flux-2-klein-4b`，普通 selector 第三项，仅作为免费实验预览 |
| 输入与引用 | multipart/form-data；最多 4 张二进制输入；字段必须是 `input_image_0`…`input_image_3`；每张图宽高严格小于 512 | 保留 Guard 接受的 prompt、typed parameters、output contract 与稳定引用顺序；第五张或不满足尺寸的输入在 transport 前阻断，calls=0 |
| 输出 | `width`/`height` 为 256–1920；一次输出 | profile-driven output preflight；固定 one-output contract |
| 推理 | 固定 4 steps、distilled 4B，不能调 steps | selector 明示速度和可能较弱的身份、服装、道具细节及复杂构图保真度 |
| 价格/额度 | 当前 Workers AI 免费分配为共享 10,000 Neurons/day；00:00 UTC 重置；付费计划超出免费额度按 Neurons 计费 | Host quota 上限不超过 10,000 Neurons/day；额度不足 fail-closed，不自动重试、不付费续用、不切 Seedream/Grok |
| 计量 | `5.37` Neurons / 输入 512×512 tile；`26.05` Neurons / 输出 512×512 tile | 以已接受输出尺寸和引用数量计算确定性预估，向上取整后预留共享 quota；传输尝试后不退款 |
| 鉴权 | REST API 需要 Account ID 与 API token；官方 REST 路径含 `/accounts/{ACCOUNT_ID}/ai/run/{model}` | `operator_managed`；只声明 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN` 环境变量名，浏览器无输入框；值不进入合同、hash、trace、receipt、响应或日志 |
| 失败 | `3036` / HTTP 429 表示 account limited、已用尽每日免费额度；`3040` / HTTP 429 表示 out of capacity；413 request too large、408 timeout 等也可能发生 | account-limited、rate-limited、transport failure 映射为安全错误；一次调用、零自动重试；不暴露 token/account/header/body |
| 隐私/训练 | Cloudflare 文档称 Customer Content 不用于训练 Workers AI 模型或改进 Cloudflare/第三方服务，除非明确同意；使用 Cloudflare 存储产品可能引入留存 | 本 Host 仅使用请求级内存上传并清理；公网部署前仍需确认账户、地域、保留时限与图片权利 |

官方链接：

- [FLUX.2 klein 4B Workers AI launch and multipart limits](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/)
- [Workers AI pricing, Neuron rates and daily reset](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI errors](https://developers.cloudflare.com/workers-ai/platform/errors/)
- [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [Workers AI REST API credentials](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)

## Seedream 5.0 Pro（`doubao-seedream-5-0-pro-260628`）

| 项目 | 官方核验结果 | Playground 处理 |
| --- | --- | --- |
| 输入 | RC.3/RC.4 验收使用 JPEG/PNG 多参考图，adapter 边界最多 10 张 | `maximumReferenceCount=10`、每图 15,000,000 bytes、媒体类型 allow-list；超限 preflight 阻断 |
| 输出 | RC.3/RC.4 使用 `n=1`、`output_format=jpeg`、`size=2K`、`watermark=false` | 固定单次单图；不发送 4.0 专用 sequential/stream/response-format 字段 |
| 价格/额度 | 旧型号的当前公开价格未在本次改动中重新推定；实际账单以当前账户控制台为准 | 页面仍显示 Host 侧单次预算估算并要求逐次确认；每日预算 2 元、不会自动重试或切 Provider |
| 鉴权 | Ark API 使用 API Key；官方文档建议放在环境变量 | 只允许 `user_ephemeral`；请求级注入，不能进入合同、hash、trace、日志或响应 |
| 引用传输 | 已验收的 Image Generation 请求使用 Base64 data URI | BYOK transport 只向 allow-listed 国内 Ark endpoint 发送一次用户确认的请求 |
| 隐私/数据 | 火山引擎官方客户数据协议将输入与生成的文本、图形、图片等定义为客户数据，要求来源合法并取得必要授权；官方信任页声明数据归用户、提供加密和生命周期管理 | UI 强制权利确认；在没有额外 retention/ZDR 书面确认前，不宣称零留存或不训练；线上启用前需再次审查条款 |
| 限流/失败 | 当前账户配额和模型开通状态优先；Provider 原始安全错误码会保留用于排障 | 速率/日预算/并发门在 Host 侧先检查；一次调用、零自动重试 |

官方链接：

- [VOCE RC.4 真实 Provider 验收](../acceptance/v0.1.0-rc.4.md)
- [火山方舟图片生成 API](https://api.volcengine.com/api-explorer/?action=ImageGenerations&groupName=%E5%9B%BE%E7%89%87%E7%94%9F%E6%88%90API&serviceCode=ark&version=2024-01-01)
- [火山方舟官方价格页](https://www.volcengine.com/product/ark)
- [火山引擎客户数据协议](https://www.volcengine.com/docs/82379/1359327?lang=zh)
- [火山引擎隐私与数据安全](https://www.volcengine.com/trust/privacy)

## Grok Imagine image quality

| 项目 | 官方核验结果 | Playground 处理 |
| --- | --- | --- |
| 输入 | Imagine overview 的 image editing 支持最多 3 张参考图；官方模型页列图像输入最大 20 MiB、JPEG/PNG | `maximumReferenceCount=3`、每图 20 MiB、JPEG/PNG；4/5 图路径明确阻断 |
| 输出/价格 | 当前 quality profile 官方 pricing 页列输入图 0.01 USD/张、1K 输出 0.05 USD、2K 输出 0.07 USD | 当前 profile 逐张计输入费用并按输出尺寸选择 1K/2K 输出价；例如 3 张输入加 1K 输出估算 0.08 USD。固定单图，实际账单以 Provider 为准 |
| 鉴权 | `Authorization: Bearer $XAI_API_KEY`；官方 quickstart 要求 API key | 只允许 `user_ephemeral`，不得写入磁盘、Cookie、localStorage、sessionStorage、analytics 或日志；不发起额外验证请求 |
| 引用传输 | 官方编辑 API 使用 `application/json`，支持 public URL 或 Base64；Files API 可用私有 `file_id` | allow-listed transport 明确使用 `xai-image-edits-json`，不使用 multipart；Host 发送请求级 Base64 data URI，不要求公开输入 URL；仅完成 Mock HTTP 回归 |
| 隐私/留存 | xAI 官方 Security FAQ：默认 API 请求和响应加密留存 30 天用于滥用审计；不以这些数据训练；团队级 ZDR 可关闭内容留存但会禁用依赖存储的功能 | 不宣称默认零留存；启用前必须确认部署账户的 ZDR/条款及文件能力 |
| 限流/失败 | 官方模型页给出 5 requests/second；生成失败、内容策略和服务错误语义仍由 API 返回 | Host 侧会话、可信客户端、Provider 每分钟、全局并发和每日门禁；单调用、无自动重试；失败只返回安全错误映射 |
| HTTP 适配状态 | 官方 `/v1/images/edits` 使用 `application/json`；单图为 `image`，多图为 `images`，输入可为 Base64 data URI；输出为单项 `data` | PR A 已实现 allow-listed BYOK HTTP 传输和安全输出下载，成功/失败只使用 Mock HTTP 验证；未执行真实 Grok 调用，profile 的 Core `verificationStatus` 保持 `declared` |

官方链接：

- [Imagine overview（最多 3 张编辑参考）](https://docs.x.ai/developers/model-capabilities/imagine)
- [xAI image editing JSON 请求格式](https://docs.x.ai/developers/model-capabilities/images/editing)
- [Grok Imagine image model](https://docs.x.ai/developers/models/grok-imagine-image)
- [xAI Imagine pricing](https://docs.x.ai/developers/pricing)
- [Imagine 私有 Files 输入](https://docs.x.ai/developers/model-capabilities/imagine/files/inputs)
- [xAI API Security / retention / ZDR](https://docs.x.ai/developers/faq/security)

## 代码边界

当前实现包括 allow-listed capability profiles、完整 profile digest、机械 materializer、Cloudflare/Seedream/Grok 正式请求转换、BYOK 请求级边界、Mock HTTP transport tests、能力/尺寸/媒体 preflight，以及按会话、可信客户端、Provider 频率、全局并发、自然日和币种预算的门禁。Provider call 只投影 Guard 已接受的正向段落、禁止项、typed parameters、output contract 与稳定引用顺序；transport 失败统一映射为安全错误码，不能把原始错误或 BYOK 回显给浏览器。Compile 使用不可生成、不会出现在 allow-list 的 inspection profile 保留完整声明计划，再对所选 Provider 单独做 capability preflight；Generate 会用所选 profile 重编译并核对绑定 hash。

Seedream 与 Grok 的 allow-listed BYOK HTTP transport 分别通过 `PLAYGROUND_ENABLE_SEEDREAM_TRANSPORT=1` 和 `PLAYGROUND_ENABLE_GROK_TRANSPORT=1` 显式启用；API Key 只从 Browser 进入一次 Generate 请求的临时调用栈，随后清空，不写盘、不回显、失败不重试。Grok 适配器只完成 Mock HTTP 成功/失败回归，没有执行真实 xAI 调用。代码与标准测试没有注入真实 secret、没有自动执行真实或付费 Provider 调用、也没有公网部署；每次真实调用仍需用户在页面输入自己的 Key 并确认单次调用。
